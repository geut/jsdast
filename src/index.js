const path = require('path')

const { TypeDefinitionParser } = require('./type-definition-parser')

function jsdastParser (options = {}) {
  const { type = 'js', ...parserOptions } = options

  const parser = new TypeDefinitionParser(parserOptions)

  this.Parser = function parse (_, vfile) {
    if (!vfile.path) {
      vfile.path = path.join(vfile.cwd, 'index.' + type)
    }

    return parser.run(vfile)
  }
}

module.exports = { parser: jsdastParser, TypeDefinitionParser }
