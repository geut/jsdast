/**
 * `callback` and `typedef` jsdoc definition are not correctly parse to the respective statement.
 * This fix try to realocate the documentation to the correct statement.
 */

const { StructureKind } = require('ts-morph')

const { getName } = require('./tsmorph-utils')

const pushTag = (doc, tag) => {
  // If we define callback or typedef first, ts-morph breaks the tags.
  // For now adding these tags to the end fix the issue.
  if (['callback', 'typedef'].includes(tag.tagName)) {
    doc.endTags.push(tag)
  } else {
    doc.tags.push(tag)
  }
}

function realocateDocs (declarationFile) {
  const statements = declarationFile.getStatements()

  statements.forEach(node => {
    // it has additional jsdoc definitions
    const docs = node.getJsDocs && node.getJsDocs()
    if (docs && docs.length > 1) {
      const isolatedDocs = docs.slice(0, docs.length - 1)
      isolatedDocs.forEach(doc => realocate(statements, doc))
    }
  })
}

function realocate (statements, doc) {
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
      const values = tagUnformatted.split(' ')
      const tagName = values.shift()
      pushTag(newDoc, { tagName, text: values.join(' ') })
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

module.exports = realocateDocs
