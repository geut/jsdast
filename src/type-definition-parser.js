const { SyntaxKind } = require('ts-morph')
const u = require('unist-builder')
const trim = require('lodash.trim')

const ModuleReader = require('./module-reader')
const { parseTags, getJsDocStructure, getName, getJsDocFromText, getType, parseParameterType, removeDocParams } = require('./tsmorph-utils')

class TypeDefinitionParser {
  constructor (opts = {}) {
    this._modules = new ModuleReader(opts)
  }

  run (src) {
    const modules = this._modules.read(src)
    return u('Root', this._parseModules(modules))
  }

  _parseModules (modules) {
    return modules.map(mod => {
      return u('Module', {
        name: mod.name,
        path: mod.path,
        doc: {
          description: mod.description,
          tags: mod.tags.map(parseTags)
        }
      }, this._parseStatements(mod))
    })
  }

  _parseStatements (mod) {
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

        switch (statement.getKind()) {
          case SyntaxKind.TypeAliasDeclaration:
            return this._parseTypeAliasDeclaration(statement, props)
          case SyntaxKind.VariableStatement:
            return this._parseDeclaration(statement, props)
          case SyntaxKind.FunctionDeclaration:
            return this._parseFunctionDeclaration(statement, props, mod)
          case SyntaxKind.ClassDeclaration:
            return this._parseClassDeclaration(statement, props, mod)
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
        props.valueType = node.getStructure().returnType
        props.parameters = node.getParameters().map((param, index) => this._parseParameter(param, index))
        break
      case SyntaxKind.TypeLiteral:
        children = [
          ...node.getMethods().map(method => this._parseMethod(method)),
          ...node.getProperties().map(prop => this._parseProperty(prop))
        ]
        break
      default:
        return null
    }

    return u(node.getKindName(), props, children)
  }

  _parseFunctionDeclaration (node, props, mod) {
    const st = node.getStructure()
    const source = mod.sourceFile.forEachDescendant(n => {
      if (getName(n) === st.name && getName(n.getParent()) === getName(node.getParent())) {
        return node
      }
    })
    props.valueType = st.returnType
    props.parameters = node.getParameters().map((param, index) => this._parseParameter(param, index, source.getStructure().parameters))
    props.isGenerator = source.isGenerator()
    props.isAsync = source.isAsync()
    return u(node.getKindName(), props)
  }

  _parseClassDeclaration (node, props, mod) {
    const st = node.getStructure()
    props.extends = st.extends
    return u(node.getKindName(), props, [
      ...node.getConstructors().map(ctr => this._parseConstructor(ctr, mod)),
      ...node.getProperties().map(prop => this._parseProperty(prop)),
      ...node.getGetAccessors().map(accessor => this._parseAccessor(accessor)),
      ...node.getSetAccessors().map(accessor => this._parseAccessor(accessor)),
      ...node.getMethods().map(method => this._parseMethod(method, mod))
    ])
  }

  _parseParameter (node, index, sourceParameters = []) {
    const st = node.getStructure()
    const parentDoc = getJsDocStructure(node.getParent())
    let doc = parentDoc && parentDoc.tags.filter(t => t.tagName === 'param')[index]
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
        typeInfo = parseParameterType(doc.typeExpression, doc)

        children = multipleObjectParameters.slice(1).map(p => u('MultipleObjectParameter', {
          name: p.name.replace(`${doc.name}.`, ''),
          doc: {
            description: p.text,
            tags: []
          },
          ...parseParameterType(p.typeExpression, p)
        }))
      }
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

    const sourceParam = sourceParameters.find(sp => sp.name === st.name)

    if (sourceParam && sourceParam.initializer) {
      props.defaultValue = sourceParam.initializer
      props.isOptional = true
    }

    return u(node.getKindName(), props, children)
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

  _parseConstructor (node, mod) {
    const source = mod.sourceFile.forEachDescendant(n => {
      if (n.getKindName() === node.getKindName() && getName(n.getParent()) === getName(node.getParent())) {
        return node
      }
    })
    return u(node.getKindName(), {
      parameters: node.getParameters().map((param, index) => this._parseParameter(param, index, source && source.getStructure().parameters)),
      valueType: getType(node),
      doc: getJsDocStructure(node, removeDocParams)
    })
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

  _parseMethod (node, mod) {
    const st = node.getStructure()
    // if (st.name === '_encode') {
    //   console.log(mod.name)
    //   mod.sourceFile.forEachDescendant(node => {
    //     console.log(node.getText())
    //     if (getName(node) === st.name) {
    //       return node
    //     }
    //   })
    // }
    const source = mod.sourceFile.forEachDescendant(n => {
      if (getName(n) === st.name && getName(n.getParent()) === getName(node.getParent())) {
        return node
      }
    })

    return u(node.getKindName(), {
      name: st.name,
      parameters: node.getParameters().map((param, index) => this._parseParameter(param, index, source.getStructure().parameters)),
      valueType: getType(node),
      doc: getJsDocStructure(node, removeDocParams),
      isGenerator: source.isGenerator(),
      isAsync: source.isAsync(),
      isStatic: st.isStatic
    })
  }
}

module.exports = TypeDefinitionParser
