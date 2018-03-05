require('jsdom-global')()

require('tape')('dom', function (t) {
  t.pass(navigator.userAgent)
  t.end()
})

require('./with_role_test')
require('./state_test')
require('./mutation_test')
require('./jquery_test')
require('./detect_mutate_test')
require('tape')('eslint', require('tape-eslint')())
