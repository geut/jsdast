/** @typedef {import('./power').Power} Power */

const { Human } = require('./human')

class Mutant extends Human {
  /**
   * Set a power
   *
   * @param {Power} power
   * @returns {Mutan}
   */
  setPower (power) {
    this._power = power
    return this
  }

  /**
   * @returns {Power}
   */
  getPower () {
    return this._power
  }
}

module.exports = { Mutant }
