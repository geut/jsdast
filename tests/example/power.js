class Power {
  /**
   * @constructor
   * @param {string} name
   */
  constructor (name) {
    this._name = name
  }

  /**
   * @prop {string}
   */
  get name () {
    return this._name
  }
}

module.exports = { Power }
