const { SyntaxKind } = require('ts-morph')
const u = require('unist-builder')
const trim = require('lodash.trim')
const parents = require('unist-util-parents')
const crypto = require('crypto')

const ModuleReader = require('./module-reader')
const { parseTags, getJsDocStructure, getName, getType, parseParameterType, removeDocParams, getParameterNameFromText } = require('./tsmorph-utils')

class TypeDefinitionParser {
  constructor (opts = {}) {
    this._modules = new ModuleReader(opts)
  }

  run (src) {
    const modules = this._modules.read(src)
    return parents(u('Root', this._parseModules(modules)))
  }

  _parseModules (modules) {
    return modules.map(mod => {
      this._currentModule = mod

      return u('Module', {
        name: mod.name,
        path: mod.path,
        doc: {
          description: mod.description,
          tags: mod.tags.map(parseTags)
        }
      }, this._parseStatements())
    })
  }

  _parseStatements () {
    return this._currentModule.declarationFile.getStatements()
      .filter(statement => {
        if ([SyntaxKind.ExportDeclaration, SyntaxKind.ImportDeclaration].includes(statement.getKind())) return false
        if (getName(statement) === '__JSDAST_END_OF_FILE__') return false
        return true
      })
      .map(statement => {
        const structure = statement.getStructure()

        const props = {
          name: getName(statement),
          doc: getJsDocStructure(statement, removeDocParams),
          isExported: structure.isExported,
          isDefaultExport: structure.isDefaultExport
        }

        switch (statement.getKind()) {
          case SyntaxKind.TypeAliasDeclaration:
            return this._parseTypeAliasDeclaration(statement, props)
          case SyntaxKind.VariableStatement:
            return this._parseDeclaration(statement, props)
          case SyntaxKind.FunctionDeclaration:
            return this._parseFunctionDeclaration(statement, props)
          case SyntaxKind.ClassDeclaration:
            return this._parseClassDeclaration(statement, props)
          default:
            return null
        }
      }).filter(Boolean)
  }

  _parseTypeAliasDeclaration (node, props) {
    node = node.getTypeNode()

    let children

    switch (node.getKind()) {
      case SyntaxKind.FunctionType:
        props.valueType = getType(node)
        children = node.getParameters().map((param, index) => this._parseParameter(param, index))
        break
      case SyntaxKind.TypeLiteral:
        children = [
          ...node.getMethods().map(method => this._parseMethod(method)),
          ...node.getProperties().map(prop => this._parseProperty(prop)),
          ...this._parseEvents(props)
        ]
        break
      default:
        return null
    }

    return u(node.getKindName(), props, children)
  }

  _parseFunctionDeclaration (node, props) {
    const st = node.getStructure()
    const source = this._currentModule.sourceFile.forEachDescendant(n => {
      if (getName(n) === st.name && getName(n.getParent()) === getName(node.getParent())) {
        return node
      }
    })
    props.valueType = getType(node)
    props.isGenerator = source.isGenerator()
    props.isAsync = source.isAsync()
    const children = node.getParameters().map((param, index) => this._parseParameter(param, index, source.getStructure().parameters))
    return u(node.getKindName(), props, children)
  }

  _parseClassDeclaration (node, props) {
    const st = node.getStructure()
    props.extends = st.extends
    return u(node.getKindName(), props, [
      ...node.getConstructors().map(ctr => this._parseConstructor(ctr)),
      ...node.getProperties().map(prop => this._parseProperty(prop)),
      ...node.getGetAccessors().map(accessor => this._parseAccessor(accessor)),
      ...node.getSetAccessors().map(accessor => this._parseAccessor(accessor)),
      ...node.getMethods().map(method => this._parseMethod(method)),
      ...this._parseEvents(props)
    ])
  }

  _parseDeclaration (node, props) {
    props.kind = node.getDeclarationKind()
    const dec = node.getDeclarations()[0]
    const st = dec.getStructure()
    props.name = st.name
    props.valueType = getType(dec)
    return u(dec.getKindName(), props)
  }

  _parseProperty (node) {
    const type = node.getKindName()
    const st = node.getStructure()
    const doc = getJsDocStructure(node, removeDocParams)

    if (doc && !doc.description) {
      const tag = doc.tags && doc.tags.find(t => t.tagName === 'type')
      doc.tags = doc.tags.filter(t => t !== tag)
      doc.description = tag && tag.text
    }

    return u(type, {
      name: st.name,
      valueType: getType(node),
      isReadonly: st.isReadonly,
      doc
    })
  }

  _parseConstructor (node) {
    const source = this._currentModule.sourceFile.forEachDescendant(n => {
      if (n.getKindName() === node.getKindName() && getName(n.getParent()) === getName(node.getParent())) {
        return node
      }
    })

    const children = node.getParameters().map((param, index) => this._parseParameter(param, index, source && source.getStructure().parameters))
    return u(node.getKindName(), {
      valueType: getType(node),
      doc: getJsDocStructure(node, removeDocParams)
    }, children)
  }

  _parseAccessor (node) {
    const st = node.getStructure()
    return u(node.getKindName(), {
      name: st.name,
      isStatic: st.isStatic,
      isReadonly: st.isReadonly,
      valueType: getType(node),
      doc: getJsDocStructure(node, removeDocParams)
    })
  }

  _parseMethod (node) {
    const st = node.getStructure()

    const source = this._currentModule.sourceFile.forEachDescendant(n => {
      if (getName(n) === st.name && getName(n.getParent()) === getName(node.getParent())) {
        return node
      }
    })

    const children = node.getParameters().map((param, index) => this._parseParameter(param, index, source.getStructure().parameters))
    return u(node.getKindName(), {
      name: st.name,
      valueType: getType(node),
      doc: getJsDocStructure(node, removeDocParams),
      isGenerator: source.isGenerator(),
      isAsync: source.isAsync(),
      isStatic: st.isStatic
    }, children)
  }

  _parseParameter (node, index, sourceParameters = []) {
    const st = node.getStructure()
    const parentDoc = getJsDocStructure(node.getParent())
    let doc = parentDoc && parentDoc.tags.filter(t => t.tagName === 'param')[index]
    let children = null
    let typeInfo = null

    if (doc && st.type.startsWith('{') && st.type.endsWith('}')) {
      const multipleObjectParameter = this._parseMultipleObjectParameter(doc)
      typeInfo = multipleObjectParameter.typeInfo
      children = multipleObjectParameter.parameters
      doc = multipleObjectParameter.doc
    } else {
      typeInfo = parseParameterType(node, doc)
    }

    let name = st.name
    if (doc && (name.startsWith('{') || name.startsWith('['))) {
      name = doc.name
    }

    const props = {
      name,
      doc: {
        description: doc && doc.text,
        tags: []
      },
      isRestParameter: st.isRestParameter,
      ...typeInfo
    }

    const sourceParam = sourceParameters[index]
    if (sourceParam && sourceParam.initializer) {
      props.defaultValue = sourceParam.initializer
      props.isOptional = true
    }

    return u(node.getKindName(), props, children)
  }

  _parseEvents (props) {
    return this._currentModule.events
      .filter(ev => ev.eventTarget === props.name)
      .map(ev => {
        let parameterTags = []
        const returnTag = []
        const tags = ev.tags.filter(t => {
          if (['param', 'type', 'prop', 'property'].includes(t.tagName)) {
            parameterTags.push(t)
            return false
          }
          if (['return', 'returns'].includes(t.tagName)) {
            returnTag.push(`* ${trim(t.fullText, '\n* ')}\n`)
            return false
          }
          return true
        })

        const type = ev.tags.find(t => t.tagName === 'type')

        const templateArgs = []

        if (type) {
          parameterTags = [
            ...parameterTags
              .filter(t => t.tagName !== 'param')
              .map(t => {
                if (t.tagName === 'type') {
                  templateArgs.push('arg')
                  return `* @param {${t.typeExpression}} arg\n`
                }

                const [name, ...text] = t.text.split(' ')
                return `* @param {${t.typeExpression}} arg.${name}${text.length > 0 ? ' ' + text.join(' ') : ''}\n`
              }),
            ...returnTag
          ]
        } else {
          parameterTags = [
            ...parameterTags
              .filter(t => !['prop', 'property'].includes(t.tagName))
              .map(t => {
                templateArgs.push(t.name)
                return `* ${trim(t.fullText, '\n* ')}\n`
              }),
            ...returnTag
          ]
        }

        const text = `/**\n${parameterTags.join('')}*/\nfunction __func__${crypto.randomBytes(6).toString('hex')} (${templateArgs.join(', ')}) {}`
        const { sourceStatement, declarationStatement } = this._modules.getStatementFromText(text)
        const sourceParameters = sourceStatement.getStructure().parameters
        const children = declarationStatement.getParameters().map((param, index) => this._parseParameter(param, index, sourceParameters))

        return u('Event', {
          name: ev.eventName,
          doc: {
            description: ev.description,
            tags
          },
          valueType: getType(declarationStatement)
        }, children)
      })
  }

  _parseMultipleObjectParameter (doc) {
    let template = doc.fullText
      .split('@param')
      .map(t => trim(t, '\n *'))
      .filter(Boolean)
      .map(t => `@param ${t}`)

    const scopeName = getParameterNameFromText(template[0])
    const templateArgs = [scopeName]
    template = template
      .map((t, i) => {
        if (i === 0) return t
        const name = getParameterNameFromText(t)
        const unscopeName = name.replace(`${scopeName}.`, '')
        templateArgs.push(unscopeName)
        const words = t.split(' ')
        words[2] = words[2].replace(name, unscopeName)
        return words.join(' ')
      })
      .map(t => `* ${t} \n`)

    const text = `/**\n${template.join('')}*/\nfunction __func__${crypto.randomBytes(6).toString('hex')} (${templateArgs.join(', ')}) {}`
    const { sourceStatement, declarationStatement } = this._modules.getStatementFromText(text)
    const sourceParameters = sourceStatement.getStructure().parameters
    const parameters = declarationStatement.getParameters()
    doc = getJsDocStructure(declarationStatement)
    doc = doc.tags.filter(t => t.tagName === 'param')[0]

    return {
      doc,
      typeInfo: parseParameterType(parameters[0], doc),
      parameters: parameters.slice(1).map((param, index) => this._parseParameter(param, index + 1, sourceParameters))
    }
  }
}

module.exports = TypeDefinitionParser
