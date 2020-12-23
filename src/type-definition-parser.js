const { SyntaxKind } = require('ts-morph')
const u = require('unist-builder')

const { ModuleReader } = require('./module-reader')
const { parseTags, getJsDocStructure, getName } = require('./tsmorph-utils')

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
          doc: getJsDocStructure(statement),
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
              ...statement.getMethods().map(this._renderMethod.bind(this))
            ]
        }

        return u(statement.getKindName(), props, children)
      })
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
    }

    return u(node.getKindName(), props, children)
  }

  _renderParameter (node) {
    const st = node.getStructure()
    return u(node.getKindName(), {
      name: st.name,
      initializer: st.initializer,
      isReadOnly: st.isReadonly,
      isRestParameter: st.isRestParameter,
      valueType: st.type
    })
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
      initializer: st.initializer,
      isReadOnly: st.isReadonly,
      valueType: st.type,
      doc: getJsDocStructure(node)
    })
  }

  _renderConstructor (node) {
    const st = node.getStructure()
    return u(node.getKindName(), {
      parameters: node.getParameters().map(this._renderParameter),
      valueType: st.returnType,
      doc: getJsDocStructure(node)
    })
  }

  _renderAccessor (node) {
    const st = node.getStructure()
    return u(node.getKindName(), {
      name: st.name,
      parameters: node.getParameters().map(this._renderParameter),
      isAbstract: st.isAbstract,
      isStatic: st.isStatic,
      valueType: st.returnType,
      doc: getJsDocStructure(node)
    })
  }

  _renderMethod (node) {
    const st = node.getStructure()
    return u(node.getKindName(), {
      name: st.name,
      parameters: node.getParameters().map(this._renderParameter),
      valueType: st.returnType,
      docs: getJsDocStructure(node),
      isGenerator: st.isGenerator,
      isAsync: st.isAsync,
      isStatic: st.isStatic,
      isAbstract: st.isAbstract
    })
  }
}

module.exports = { TypeDefinitionParser }
