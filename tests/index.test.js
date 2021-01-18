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

test('MultipleObjectParameter', () => {
  const tree = unified().use(parser).parse(`
/**
 * @param {string} [a]
 * @param {object} opts a text description
 * @param {string} [opts.name='test'] name description
 * @param {number} opts.age age description
 * @param {number} b
 */
function test(a, opts, b) {
  return opts.name
}

class Test {
  /**
   * @param {string} [a]
   * @param {object} opts a text description
   * @param {string} [opts.name='test'] name description
   * @param {number} opts.age age description
   * @param {number} b
   */
  test(a, opts, b) {}
}
  `)

  for (const node of tree.children) {
    delete node.path
  }

  expect(tree).toMatchSnapshot()
})

test('destructuring', () => {
  const tree = unified().use(parser).parse(`
/**
 * @param {object} opts
 */
function test({ name, age }) {}
  `)

  for (const node of tree.children) {
    delete node.path
  }

  expect(tree).toMatchSnapshot()
})
