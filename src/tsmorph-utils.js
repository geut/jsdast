const { SyntaxKind } = require('ts-morph')
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
  const doc = node.getKind() === SyntaxKind.JSDocComment ? node : getJsDoc(node)
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

const getType = (node, asArray = false) => {
  let type
  if (typeof node === 'string') {
    type = node
  } else {
    const st = node.getStructure()
    const stType = node.getReturnType ? st.returnType : st.type
    const { compilerType } = node.getReturnType ? node.getReturnType() : node.getType()
    type = compilerType.thisType ? compilerType.thisType.symbol.escapedName : stType
  }
  if (!type) return
  const arr = type.split('|').map(t => t.trim())
  if (asArray) return arr
  return arr.join(' | ')
}

const getIsOptional = (node, type) => {
  if (type[type.length - 1].trim() === 'null') return true
  if (typeof node !== 'string' && node.isOptional) return node.isOptional()
  return false
}

const parseParameterType = (node, doc) => {
  let type = getType(node, true)
  const isOptional = getIsOptional(node, type)

  type = type.filter(t => t !== 'null').join(' | ')

  if (!doc) return { valueType: type, isOptional }

  const defaultValue = doc.fullText.match(new RegExp(`\\}\\s\\[${doc.name}=(\\s*.*)\\]`, 'i'))
  if (defaultValue && defaultValue.length === 2) {
    return { valueType: type, isOptional: true, defaultValue: defaultValue[1] }
  }

  return { valueType: type, isOptional }
}

const removeDocParams = tag => !['param'].includes(tag.tagName)

const getParameterNameFromText = text => {
  const name = text.split(' ')[2]
  if (!name) return ''
  return trim(name, '[]').split('=')[0].trim()
}

module.exports = {
  parseTextTag,
  parseTags,
  getJsDoc,
  getJsDocStructure,
  getName,
  moduleTags,
  getType,
  parseParameterType,
  removeDocParams,
  getParameterNameFromText
}
