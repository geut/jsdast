/** @typedef {import('ts-morph').SourceFile} SourceFile */
/** @typedef {import('ts-morph').JSDoc} JSDoc */

const assert = require('assert')
const { Project, StructureKind } = require('ts-morph')

const { parseTextTag, getName, pushTag, moduleTags } = require('./tsmorph-utils')

class ModuleFile {
  constructor (sourceFile, declarationFile) {
    /** @type {SourceFile} */
    this.sourceFile = sourceFile
    /** @type {SourceFile} */
    this.declarationFile = declarationFile
    /** @type {JSDoc} */
    this.doc = null

    const statements = this.sourceFile.getStatementsWithComments()
    const documentation = statements.length > 0 && statements[0].getJsDocs()[0]
    if (documentation && documentation.getTags().find(t => moduleTags.includes(t.getTagName()))) {
      // module documentation
      this.doc = documentation
    }

    this._fixJsDocs()
  }

  get path () {
    return this.sourceFile.getFilePath()
  }

  get name () {
    const tagModule = this.doc && this.doc.getTags().find(t => t.getTagName() === 'module')
    return tagModule ? parseTextTag(tagModule) : this.sourceFile.getBaseName()
  }

  get description () {
    return this.doc ? this.doc.getDescription() : ''
  }

  get tags () {
    return this.doc ? this.doc.getTags() : []
  }

  /**
   * `callback` and `typedef` jsdoc definition are not correctly parse to the respective statement.
   * This fix try to realocate the documentation to the correct statement.
   */
  _fixJsDocs () {
    const statements = this.declarationFile.getStatements()

    statements.forEach(node => {
      // it has additional jsdoc definitions
      const docs = node.getJsDocs && node.getJsDocs()
      if (docs && docs.length > 1) {
        const isolatedDocs = docs.slice(0, docs.length - 1)
        isolatedDocs.forEach(doc => this._realocateDocStatements(statements, doc))
      }
    })
  }

  _realocateDocStatements (statements, doc) {
    const description = doc.getDescription()
    const newDoc = {
      kind: StructureKind.JSDoc,
      description: description && `\n${description}\n`,
      tags: [],
      endTags: []
    }

    const tags = doc.getTags()
    tags.forEach(tag => {
      const st = tag.getStructure()

      if (!st.text || !st.text.includes('\n@')) {
        pushTag(newDoc, { tagName: st.tagName, text: st.text })
        return
      }

      const splitted = st.text.split('\n@')
      pushTag(newDoc, { tagName: tag.getTagName(), text: splitted.shift() })
      splitted.forEach(tagUnformatted => {
        const [tagName, text] = tagUnformatted.split(' ')
        pushTag(newDoc, { tagName, text })
      })
    })

    doc.remove()

    newDoc.tags = newDoc.tags.concat(newDoc.endTags)

    const tag = newDoc.tags.find(t => ['name', 'callback', 'typedef'].includes(t.tagName))
    if (!tag) return

    const st = statements.find(st => tag.text.includes(getName(st)))
    if (st) {
      st.addJsDoc(newDoc)
    }
  }
}

class ModuleReader {
  constructor (opts = {}) {
    this._opts = opts
    this._project = new Project(opts)
    this._modules = new Map()
  }

  /**
   * @returns {Array<ModuleFile>}
   */
  read (src) {
    const { path, contents } = src

    assert(path, 'path is required')

    const project = new Project({
      ...this._opts,
      compilerOptions: {
        ...(this._opts.compilerOptions || {}),
        allowJs: true,
        declaration: true,
        esModuleInterop: true
      }
    })

    project.addSourceFilesAtPaths(path)

    if (contents) {
      project.createSourceFile(path, contents, { overwrite: true })
    }

    project.resolveSourceFileDependencies()

    const result = project.emitToMemory({ emitOnlyDtsFiles: true })
    for (const diagnostic of result.getDiagnostics()) {
      console.warning(diagnostic.getMessageText())
    }

    for (let declarationFile of result.getFiles()) {
      const { filePath } = declarationFile
      const pattern = `${filePath.replace('.d.ts', '')}{.ts,.js,.jsx,.tsx}`
      const sourceFile = project.getSourceFiles(pattern)[0]
      declarationFile = this._project.createSourceFile(filePath, declarationFile.text, { overwrite: true })
      this._modules.set(sourceFile.getFilePath(), new ModuleFile(sourceFile, declarationFile))
    }

    return Array.from(this._modules.values())
  }
}

module.exports = { ModuleReader }
