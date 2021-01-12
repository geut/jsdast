const { Project, SyntaxKind, InMemoryFileSystemHost, Node } = require('ts-morph')

const trim = require('lodash.trim')

const moduleTags = ['module', 'remarks', 'privateRemarks', 'packageDocumentation']

const parseTextTag = (tag) => tag.getMessageText ? tag.getMessageText() : tag.getComment()

const typeRegex = /\{(.*)\}/

const parseTags = (tag) => {
  const structure = tag.getStructure()

  const name = tag.getName && tag.getName()

  let typeExpression = tag.getTypeExpression && tag.getTypeExpression()
  typeExpression = typeExpression && tag.getTypeExpression().getTypeNode().getText()

  let text = tag.getMessageText ? tag.getMessageText() : tag.getComment()
  text = text && text.length > 0 ? text : structure.text

  if (text) {
    // example and remarks allows to define rich text inside, we ignore those tags
    if (!moduleTags.includes(structure.tagName) && structure.tagName !== 'example') {
      const matches = text.match(typeRegex)
      if (matches) {
        text = text.replace(matches[0], '').trim()
        if (!typeExpression) {
          typeExpression = matches[1]
        }
      }
    }

    const texts = text.split(' ')

    if (texts[0] === name || texts[0].startsWith(name) || texts[0].startsWith(`[${name}`)) {
      text = texts.slice(1).join(' ')
    }
  }

  return {
    tagName: tag.getTagName(),
    name,
    text: text && text.length > 0 ? trim(text, '\n ') : undefined,
    fullText: tag.getFullText(),
    typeExpression
  }
}

const getJsDoc = (node) => {
  if (!node.getJsDocs) return

  const docs = node.getJsDocs()
  if (docs.length === 0) return
  return docs[docs.length - 1]
}

const getJsDocStructure = (node, filter = () => true) => {
  const doc = getJsDoc(node)
  if (!doc) return
  const description = trim(doc.getDescription(), '\n ')
  return {
    description: description.length > 0 ? description : undefined,
    tags: doc.getTags().map(parseTags).filter(filter)
  }
}

const getName = node => {
  if (node.getName) return node.getName()

  if (node.getKind() === SyntaxKind.VariableStatement) {
    return node.getStructure().declarations[0].name
  }
}

function getInfoFromText (text, opts = {}) {
  const {
    isDefinitionFile = false,
    filePath = undefined,
    host = new InMemoryFileSystemHost({ skipLoadingLibFiles: true }),
    compilerOptions = undefined
  } = opts

  const project = new Project({ compilerOptions, fileSystem: host })
  const sourceFile = project.createSourceFile(getFilePath(), text)

  return {
    project,
    sourceFile,
    firstChild: sourceFile.forEachChild(child => child)
  }

  function getFilePath () {
    if (filePath != null) { return filePath }
    return isDefinitionFile ? 'testFile.d.ts' : 'testFile.ts'
  }
}

function getJsDocFromText (text) {
  const info = getInfoFromText(text)
  return { descendant: info.sourceFile.getFirstDescendantOrThrow(Node.isJSDocTag), ...info }
}

module.exports = { parseTextTag, parseTags, getJsDoc, getJsDocStructure, getName, moduleTags, getInfoFromText, getJsDocFromText }
