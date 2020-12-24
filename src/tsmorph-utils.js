const { SyntaxKind } = require('ts-morph')
const trim = require('lodash.trim')

const moduleTags = ['module', 'remarks', 'privateRemarks', 'packageDocumentation']

const parseTextTag = (tag) => tag.getMessageText ? tag.getMessageText() : tag.getComment()

const typeRegex = /\{(.*)\}/

const parseTags = (tag) => {
  const structure = tag.getStructure()

  let typeExpression = tag.getTypeExpression && tag.getTypeExpression()
  typeExpression = typeExpression && tag.getTypeExpression().getTypeNode().getText()

  let text = tag.getMessageText ? tag.getMessageText() : tag.getComment()
  text = text && text.length > 0 ? text : structure.text

  // example and remarks allows to define rich text inside, we ignore those tags
  if (text && !moduleTags.includes(structure.tagName) && structure.tagName !== 'example') {
    const matches = text.match(typeRegex)
    if (matches) {
      text = text.replace(matches[0], '').trim()
      if (!typeExpression) {
        typeExpression = matches[1]
      }
    }
  }

  const name = tag.getName && tag.getName()
  if (name === text) {
    text = undefined
  }

  return {
    tagName: tag.getTagName(),
    name,
    text: text && text.length > 0 ? trim(text, '\n ') : undefined,
    fullText: tag.getFullText(),
    typeExpression
  }
}

const pushTag = (doc, tag) => {
  // If we define callback or typedef first, ts-morph breaks the tags.
  // For now adding these tags to the end fix the issue.
  if (['callback', 'typedef'].includes(tag.tagName)) {
    doc.endTags.push(tag)
  } else {
    doc.tags.push(tag)
  }
}

const getJsDoc = (node) => {
  if (!node.getJsDocs) return

  const docs = node.getJsDocs()
  if (docs.length === 0) return
  return docs[docs.length - 1]
}

const getJsDocStructure = (node) => {
  const doc = getJsDoc(node)
  if (!doc) return
  const description = trim(doc.getDescription(), '\n ')
  return {
    description: description.length > 0 ? description : undefined,
    tags: doc.getTags().map(parseTags)
  }
}

const getName = node => {
  if (node.getName) return node.getName()

  if (node.getKind() === SyntaxKind.VariableStatement) {
    return node.getStructure().declarations[0].name
  }
}

module.exports = { parseTextTag, parseTags, getJsDoc, getJsDocStructure, getName, pushTag, moduleTags }
