/** @typedef {import('ts-morph').SourceFile} SourceFile */
/** @typedef {import('ts-morph').JSDoc} JSDoc */

const assert = require('assert')
const { Project, InMemoryFileSystemHost, Node } = require('ts-morph')
const pascalcase = require('pascalcase')
const crypto = require('crypto')
const fg = require('fast-glob')
const fs = require('fs')
const { resolve: resolvePath } = require('path')

const { parseTextTag, moduleTags, getJsDocStructure } = require('./tsmorph-utils')

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

    this.events = []
    statements.forEach(statement => {
      if (!statement.getJsDocs) return
      const docs = statement.getJsDocs()
      docs.forEach(doc => {
        if (!doc.getTags().find(t => t.getTagName() === 'event')) {
          return
        }

        doc = getJsDocStructure(doc)
        const eventTag = doc.tags.find(t => t.tagName === 'event')
        doc.tags = doc.tags.filter(t => t.tagName !== 'event')
        const [target, name] = eventTag.text.split('#')
        doc.eventTarget = target
        doc.eventName = name
        this.events.push(doc)
      })
    })
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
    this._project = new Project({
      ...this._opts,
      compilerOptions: {
        exclude: ['node_modules'],
        ...(this._opts.compilerOptions || {}),
        allowJs: true,
        declaration: true,
        esModuleInterop: true,
        resolveJsonModule: true
      },
      fileSystem: new InMemoryFileSystemHost({ skipLoadingLibFiles: true })
    })
    this._fromProject = new Project({
      ...this._opts,
      compilerOptions: {
        exclude: ['node_modules'],
        ...(this._opts.compilerOptions || {}),
        allowJs: true,
        declaration: true,
        esModuleInterop: true,
        resolveJsonModule: true
      }
    })
    this._modules = new Map()
  }

  /**
   * @returns {Array<ModuleFile>}
   */
  read (src) {
    const { path, contents } = src

    assert(path, 'path is required')

    fg.sync([path]).forEach(entry => {
      const filePath = resolvePath(entry)
      let text = fs.readFileSync(filePath, 'utf-8')
      // we have to add a last statement for bottom JSDoc documentations
      text += '\nfunction __JSDAST_END_OF_FILE__ () {}'
      this._fromProject.createSourceFile(path, text, { overwrite: true })
    })

    if (contents) {
      this._fromProject.createSourceFile(path, contents, { overwrite: true })
    }

    this._fromProject.resolveSourceFileDependencies()

    const result = this._fromProject.emitToMemory({ emitOnlyDtsFiles: true })
    for (const diagnostic of result.getDiagnostics()) {
      console.warning(diagnostic.getMessageText())
    }

    for (let declarationFile of result.getFiles()) {
      const { filePath } = declarationFile
      const pattern = `${filePath.replace('.d.ts', '')}{.ts,.js,.jsx,.tsx}`
      const sourceFile = this._fromProject.getSourceFiles(pattern)[0]
      declarationFile = this._project.createSourceFile(filePath, declarationFile.text, { overwrite: true })
      this._modules.set(sourceFile.getFilePath(), new ModuleFile(sourceFile, declarationFile))
    }

    return Array.from(this._modules.values())
  }

  getStatementFromText (text) {
    const sourceFile = this._fromProject.createSourceFile(`${crypto.randomBytes(32).toString('hex')}.js`, text, { overwrite: true })

    const result = sourceFile.getEmitOutput({ emitOnlyDtsFiles: true })
    let declarationFile = result.getOutputFiles()[0]
    declarationFile = this._project.createSourceFile(declarationFile.getFilePath(), declarationFile.getText(), { overwrite: true })

    return {
      sourceFile,
      declarationFile,
      sourceStatement: sourceFile.forEachChild(child => child),
      declarationStatement: declarationFile.forEachChild(child => child)
    }
  }

  getJsDocFromText (text) {
    const info = this.getStatementFromText(text)
    return { doc: info.declarationFile.getFirstDescendantOrThrow(Node.isJSDocTag), ...info }
  }
}

module.exports = ModuleReader
