/** @typedef {import('ts-morph').SourceFile} SourceFile */
/** @typedef {import('ts-morph').JSDoc} JSDoc */

const assert = require('assert')
const { Project } = require('ts-morph')
const pascalcase = require('pascalcase')

const { parseTextTag, moduleTags } = require('./tsmorph-utils')
const realocateDocs = require('./realocate-docs')

class ModuleFile {
  constructor (sourceFile, declarationFile) {
    /** @type {SourceFile} */
    this.sourceFile = sourceFile
    /** @type {SourceFile} */
    this.declarationFile = declarationFile
    /** @type {JSDoc} */
    this.doc = null

    const statements = this.sourceFile.getStatementsWithComments()
    const documentation = statements.length > 0 && statements[0].getJsDocs && statements[0].getJsDocs()[0]
    if (documentation && documentation.getTags().find(t => moduleTags.includes(t.getTagName()))) {
      // module documentation
      this.doc = documentation
    }

    realocateDocs(this.declarationFile)
  }

  get path () {
    return this.sourceFile.getFilePath()
  }

  get name () {
    const tagModule = this.doc && this.doc.getTags().find(t => t.getTagName() === 'module')
    return tagModule ? parseTextTag(tagModule) : pascalcase(this.sourceFile.getBaseName().split('.').slice(0, -1).join('.'))
  }

  get description () {
    return this.doc ? this.doc.getDescription() : ''
  }

  get tags () {
    return this.doc ? this.doc.getTags() : []
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

module.exports = ModuleReader
