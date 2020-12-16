const unified = require('unified')
const toVFile = require('to-vfile')

const jsdastParser = require('..')

test('basic from vfile', () => {
  const tree = unified().use(jsdastParser).parse(toVFile('./example/index.js'))
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
  expect(tree).toMatchSnapshot()
})
