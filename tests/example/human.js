/**
 * A library for building widgets.
 *
 * @remarks
 * The `widget-lib` defines the {@link IWidget} interface and {@link Widget} class,
 * which are used to build widgets.
 *
 * @packageDocumentation
 */

/**
 * This is a callback example
 * @callback createHumanCallback
 * @param {number} age Set the age
 * @returns {Human}
 */

/**
 * This is a typedef example
 * @typedef options
 * @type {Object}
 * @prop {string} options.a some a description
 * @prop {number} options.b
 */

/**
 * It's a human factory
 *
 * @param {string} name Set a name
 * @returns {createHumanCallback} a function
 */
function humanFactory (name) {
  return function createHuman (age) {
    return new Human(name, age)
  }
}

/**
 * @example
 * const human = new Human('pepe', 20)
 * console.log(human.age)
 * @description eso es
 */
class Human {
  /**
   * @constructor
   * @param {string} name - Set a name
   * @param {number} age Set the age
   */
  constructor (name, age) {
    this._name = name
    this._age = age
  }

  /**
   * @prop {string}
   */
  get name () {
    return this._name
  }

  get age () {
    return this._age
  }

  set age (val) {
    this._age = val
  }

  sayHello () {
    return this._name
  }

  /**
   * @private
   */
  _aPrivateMethod () {}
}

const CONSTANT = 'test'

module.exports = { Human, humanFactory, CONSTANT }
