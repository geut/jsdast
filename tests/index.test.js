const unified = require('unified')
const toVFile = require('to-vfile')
const path = require('path')

const { parser } = require('..')

test('basic from vfile', () => {
  const tree = unified().use(parser).parse(toVFile(path.join(__dirname, './example/index.js')))

  for (const node of tree.children) {
    delete node.path
  }

  expect(tree).toMatchSnapshot()
})

test('basic from plain content', () => {
  const tree = unified().use(parser).parse(`
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
