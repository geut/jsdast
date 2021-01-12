const { SyntaxKind } = require('ts-morph')
const u = require('unist-builder')
const trim = require('lodash.trim')

const ModuleReader = require('./module-reader')
const { parseTags, getJsDocStructure, getName, getJsDocFromText } = require('./tsmorph-utils')

const isOptional = type => type.split('|').pop().trim() === 'null'

const parseType = (type, doc) => {
  if (!doc) return { valueType: type, isOptional: isOptional(type) }

  if (doc.fullText.includes(`} [${doc.name}]`)) {
    return { valueType: `${type} | null`, isOptional: true }
  }

  const defaultValue = doc.fullText.match(new RegExp(`\\}\\s\\[${doc.name}=(\\s*.*)\\]`, 'i'))

  if (defaultValue && defaultValue.length === 2) {
    return { valueType: `${type} | ${defaultValue[1]}`, isOptional: true }
  }

  return { valueType: type, isOptional: isOptional(type) }
}

const removeDocParams = tag => !['param'].includes(tag.tagName)

class TypeDefinitionParser {
  constructor (opts = {}) {
    this._modules = new ModuleReader(opts)

    this._renderAccessor = this._renderAccessor.bind(this)
    this._renderConstructor = this._renderConstructor.bind(this)
    this._renderDeclaration = this._renderDeclaration.bind(this)
    this._renderMethod = this._renderMethod.bind(this)
    this._renderParameter = this._renderParameter.bind(this)
    this._renderProperty = this._renderProperty.bind(this)
    this._renderTypeAliasDeclaration = this._renderTypeAliasDeclaration.bind(this)
  }

  run (src) {
    const modules = this._modules.read(src)
    return u('Root', this._renderModules(modules))
  }

  _renderModules (modules) {
    return modules.map(mod => {
      return u('Module', {
        name: mod.name,
        path: mod.path,
        doc: {
          description: mod.description,
          tags: mod.tags.map(parseTags)
        }
      }, this._renderStatements(mod))
    })
  }

  _renderStatements (mod) {
    return mod.declarationFile.getStatements()
      .filter(statement => ![SyntaxKind.ExportDeclaration, SyntaxKind.ImportDeclaration].includes(statement.getKind()))
      .map(statement => {
        const structure = statement.getStructure()

        const props = {
          name: getName(statement),
          doc: getJsDocStructure(statement, removeDocParams),
          isExported: structure.isExported,
          isDefaultExport: structure.isDefaultExport
        }

        let children

        switch (statement.getKind()) {
          case SyntaxKind.TypeAliasDeclaration:
            return this._renderTypeAliasDeclaration(statement.getTypeNode(), props)
          case SyntaxKind.VariableStatement:
            return this._renderDeclaration(statement, props)
          case SyntaxKind.FunctionDeclaration:
            props.valueType = structure.returnType
            props.parameters = statement.getParameters().map(this._renderParameter)
            break
          case SyntaxKind.ClassDeclaration:
            props.extends = structure.extends
            children = [
              ...statement.getConstructors().map(this._renderConstructor.bind(this)),
              ...statement.getProperties().map(this._renderProperty.bind(this)),
              ...statement.getGetAccessors().map(this._renderAccessor.bind(this)),
              ...statement.getSetAccessors().map(this._renderAccessor.bind(this)),
              ...statement.getMethods().map(this._renderMethod.bind(this))
            ]
            break
          default:
            return null
        }

        return u(statement.getKindName(), props, children)
      }).filter(Boolean)
  }

  _renderTypeAliasDeclaration (node, props) {
    let children

    switch (node.getKind()) {
      case SyntaxKind.FunctionType:
        props.valueType = node.getStructure().returnType
        props.parameters = node.getParameters().map(this._renderParameter)
        break
      case SyntaxKind.TypeLiteral:
        children = [
          ...node.getMethods().map(this._renderMethod),
          ...node.getProperties().map(this._renderProperty)
        ]
        break
      default:
        return null
    }

    return u(node.getKindName(), props, children)
  }

  _renderParameter (node) {
    const st = node.getStructure()
    const parentDoc = getJsDocStructure(node.getParent())
    let doc = parentDoc && parentDoc.tags.find(t => t.tagName === 'param' && t.name === st.name)
    let children = null
    let typeInfo = null

    if (doc && st.type.startsWith('{') && st.type.endsWith('}')) {
      const multipleObjectParameters = doc.fullText
        .split('@param')
        .map(t => trim(t, '\n *'))
        .filter(Boolean)
        .map(t => getJsDocFromText(`/** @param ${t} */\nfunction test() {}`).descendant)
        .map(t => parseTags(t))

      doc = multipleObjectParameters[0]

      if (multipleObjectParameters.length > 1) {
        typeInfo = parseType(doc.typeExpression, doc)

        children = multipleObjectParameters.slice(1).map(p => u('MultipleObjectParameter', {
          name: p.name.replace(`${doc.name}.`, ''),
          doc: {
            description: p.text,
            tags: []
          },
          ...parseType(p.typeExpression, p)
        }))
      }
    } else {
      typeInfo = parseType(st.type, doc)
    }

    return u(node.getKindName(), {
      name: st.name,
      doc: {
        description: doc && doc.text,
        tags: []
      },
      isRestParameter: st.isRestParameter,
      ...typeInfo
    }, children)
  }

  _renderDeclaration (node, props) {
    props.kind = node.getDeclarationKind()
    const dec = node.getDeclarations()[0]
    const st = dec.getStructure()
    props.name = st.name
    props.valueType = st.type
    return u(dec.getKindName(), props)
  }

  _renderProperty (node) {
    const st = node.getStructure()
    return u(node.getKindName(), {
      name: st.name,
      valueType: st.type,
      doc: getJsDocStructure(node, removeDocParams)
    })
  }

  _renderConstructor (node) {
    const st = node.getStructure()
    return u(node.getKindName(), {
      parameters: node.getParameters().map(this._renderParameter),
      valueType: st.returnType,
      doc: getJsDocStructure(node, removeDocParams)
    })
  }

  _renderAccessor (node) {
    const st = node.getStructure()
    let valueType = node.getParameters()[0]
    if (valueType) {
      valueType = valueType.getStructure().type
    }
    return u(node.getKindName(), {
      name: st.name,
      isAbstract: st.isAbstract,
      isStatic: st.isStatic,
      valueType: valueType || st.returnType,
      doc: getJsDocStructure(node, removeDocParams)
    })
  }

  _renderMethod (node) {
    const st = node.getStructure()
    return u(node.getKindName(), {
      name: st.name,
      parameters: node.getParameters().map(this._renderParameter),
      valueType: st.returnType,
      doc: getJsDocStructure(node, removeDocParams),
      isGenerator: st.isGenerator,
      isAsync: st.isAsync,
      isStatic: st.isStatic,
      isAbstract: st.isAbstract
    })
  }
}

module.exports = TypeDefinitionParser
