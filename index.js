/*
  * Internal: Registry.
  */

let handlers, behaviors, selectors

/*
  * Internal: IDs for auto-incrementing.
  */

let bid = 0 /* behavior ID */
let cid = 0 /* component ID */

/**
  * (Module) Adds a behavior, or triggers behaviors.
  *
  * When no parameters are passed, it triggers all behaviors. When one
  * parameter is passed, it triggers the given behavior. Otherwise, it adds a
  * behavior.
  *
  *     // define a behavior
  *     $.onmount('.select-box', function () {
  *       $(this).on('...')
  *     })
  *
  *     // define a behavior with exit
  *     $.onmount('.select-box', function () {
  *       $(document).on('...')
  *     }, function () {
  *       $(document).off('...')
  *     })
  *
  *     // retrigger a onmount
  *     $.onmount('.select-box')
  *
  *     // retriggers all behaviors
  *     $.onmount()
  */

function onmount (selector, init, exit, options) {
  if (typeof exit === 'object') {
    options = exit
    exit = undefined
  }

  if (arguments.length === 0 || isjQuery(selector) || isEvent(selector)) {
    // onmount() - trigger all behaviors. Also account for cases such as
    // $($.onmount), where it's triggered with a jQuery event object.
    onmount.poll()
  } else if (arguments.length === 1) {
    // onmount(selector) - trigger for a given selector.
    onmount.poll(selector)
  } else {
    // onmount(sel, fn, [fn]) - register a new behavior.
    var be = new Behavior(selector, init, exit, options)
    behaviors.push(be)
    be.register()
  }

  return this
}

/*
  * Detect MutationObserver support for `onmount.observe()`.
  * You may even add a polyfill here via
  * `onmount.MutationObserver = require('mutation-observer')`.
  */

onmount.MutationObserver =
  global.MutationObserver ||
  global.WebKitMutationObserver ||
  global.MozMutationObserver

/**
  * Internal: triggers behaviors for a selector or for all.
  *
  *     onmount.poll()
  *     onmount.poll('.js-button')
  */

onmount.poll = function poll (selector) {
  var functions = (selector ? selectors[selector] : handlers) || []
  each(functions, function (fn) { fn() })
}

/**
  * Observes automatically using MutationObserver events.
  *
  *     onmount.observe()
  */

onmount.observe = function observe () {
  var MutationObserver = onmount.MutationObserver
  if (typeof MutationObserver === 'undefined') return

  var obs = new MutationObserver(function (mutations) {
    each(behaviors, function (be) {
      each(mutations, function (mutation) {
        each(mutation.addedNodes, function (el) {
          if (el.matches(be.selector)) be.visitEnter(el)
        })

        each(mutation.removedNodes, function (el) {
          if (el.matches(be.selector)) be.doExit(el)
        })
      })
    })
  })

  obs.observe(document, { subtree: true, childList: true })
  onmount.observer = obs

  // trigger everything before going
  onmount()
  return true
}

/**
  * Turns off observation first issued by `onmount.observe()`.
  */

onmount.unobserve = function unobserve () {
  if (!this.observer) return
  this.observer.disconnect()
  delete this.observer
}

/**
  * Forces teardown of all behaviors currently applied.
  */

onmount.teardown = function teardown () {
  each(behaviors, function (be) {
    each(be.loaded, function (el, i) {
      if (el) be.doExit(el, i)
    })
  })
}

/**
  * Clears all behaviors. Useful for tests.
  * This will NOT call exit handlers.
  */

onmount.reset = function reset () {
  handlers = onmount.handlers = []
  selectors = onmount.selectors = {}
  behaviors = onmount.behaviors = []
}

/**
  * Internal: behavior class
  */

function Behavior (selector, init, exit, options) {
  this.id = 'b' + bid++
  this.init = init
  this.exit = exit
  this.selector = selector
  this.loaded = [] // keep track of dom elements loaded for this behavior
  this.key = '__onmount:' + bid // leave the state in el['__onmount:12']
  this.detectMutate = options && options.detectMutate
}

/**
  * Internal: initialize this behavior by registering itself to the internal
  * `selectors` map. This allows you to call `onmount(selector)` later on.
  */

Behavior.prototype.register = function () {
  var be = this
  var loaded = this.loaded
  var selector = this.selector

  register(selector, function () {
    var list = query(selector)

    // This is the function invoked on `onmount(selector)`.
    // Clean up old ones (if they're not in the DOM anymore).
    each(loaded, function (element, i) {
      be.visitExit(element, i, list)
    })

    // Clean up new ones (if they're not loaded yet).
    eachOf(list, function (element) {
      be.visitEnter(element)
    })
  })
}

/**
  * Internal: visits the element `el` and turns it on if applicable.
  */

Behavior.prototype.visitEnter = function (el) {
  if (el[this.key]) return
  var options = { id: 'c' + cid, selector: this.selector }
  if (this.init.call(el, options) !== false) {
    el[this.key] = options
    this.loaded.push(el)
    cid++
  }
}

/**
  * Internal: visits the element `el` and sees if it needs its exit handler
  * called.
  */

Behavior.prototype.visitExit = function (el, i, list) {
  if (!el) return
  if (this.detectMutate) {
    if (!has(list, el)) return this.doExit(el, i)
  } else {
    if (!isAttached(el)) return this.doExit(el, i)
  }
}

/**
  * Internal: calls the exit handler for the behavior for element `el` (if
  * available), and marks the behavior/element as uninitialized.
  */

Behavior.prototype.doExit = function (el, i) {
  if (typeof i === 'undefined') i = this.loaded.indexOf(el)
  this.loaded[i] = undefined
  if (this.exit && this.exit.call(el, el[this.key]) !== false) {
    delete el[this.key]
  }
}

/**
  * Internal: check if an element is still attached to its document.
  */

function isAttached (el) {
  while (el) {
    if (el === document.documentElement) return true
    el = el.parentElement
  }
}

/**
  * Internal: reimplementation of `$('...')`. If jQuery is available,
  * use it (I guess to preserve IE compatibility and to enable special jQuery
  * attribute selectors). Use with `eachOf()` or `has()`.
  */

function query (selector, fn) {
  return document.querySelectorAll(selector)
}

/**
  * Internal: iterates through a `query()` result.
  */

function eachOf (list, fn) {
  return each(list, fn)
}

/**
  * Interanl: checks if given element `el` is in the query result `list`.
  */

function has (list, el) {
  // TODO use contains
  return Array.from(list).indexOf(el) > -1
}

/**
  * Internal: registers a behavior handler for a selector.
  */

function register (selector, fn) {
  if (!selectors[selector]) selectors[selector] = []
  selectors[selector].push(fn)
  handlers.push(fn)
}

/**
  * Iterates through `list` (an array or an object). This is useful when dealing
  * with NodeLists like `document.querySelectorAll`.
  *
  *     var each = require('dom101/each');
  *     var qa = require('dom101/query-selector-all');
  *
  *     each(qa('.button'), function (el) {
  *       addClass('el', 'selected');
  *     });
  */

function each (list, fn) {
  var i
  var len = list.length
  // TODO array.from()

  if (len === +len) {
    for (i = 0; i < len; i++) { fn(list[i], i) }
  } else {
    for (i in list) {
      if (list.hasOwnProperty(i)) fn(list[i], i)
    }
  }

  return list
}

function isjQuery ($) {
  // TODO deprecate isJquery
  return typeof $ === 'function' && $.fn && $.noConflict
}

function isEvent (e) {
  return typeof e === 'object' && e.target
}

/*
  * Export
  */

onmount.reset()

export default onmount
