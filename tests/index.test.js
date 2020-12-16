const unified = require('unified')
const toVFile = require('to-vfile')

const jsdastParser = require('..')

test('basic from vfile', () => {
  const tree = unified().use(jsdastParser).parse(toVFile('./example/index.js'))

  for (const node of tree.children) {
    delete node.path
  }

  expect(tree).toMatchSnapshot()
})

test('basic from plain content', () => {
  const tree = unified().use(jsdastParser).parse(`
/**
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function sum(a, b) {
  return a + b
}
  `)

  for (const node of tree.children) {
    delete node.path
  }

  expect(tree).toMatchSnapshot()
})
