(function($) {
	'use strict';

	/* global swiftbox */

	if(!$) {
		return;
	}

	/**
	 * jQuery plugin function
	 * @return {Object} The jQuery collection the function was called on
	 */
	$.fn.swiftbox = function() {
		var args = Array.prototype.slice.call(arguments, 0);

		// Initialize if the first argument is undefined or an object
		if(args[0] === undefined || typeof args[0] === 'object') {
			args.unshift(this);

			return $(swiftbox.apply(null, args));
		}

		// Determine the method to be called
		var method = args.shift();

		if(typeof swiftbox[method] !== 'function') {
			throw new Error('Invalid SwiftBox method: ' + method);
		}

		// Add the elements as the first argument
		args.unshift($(swiftbox(this)));

		// Call the method
		return swiftbox[method].apply(null, args);
	};

	// Extend the :input pseudo-selector
	var jquery_input_selector = $.expr[':'].input;

	$.expr[':'].input = function(element) {
		// If this is a SwiftBox, it matches
		if(element.tagName === 'SWIFT-BOX') {
			return true;
		}

		// Check for SwiftBox hidden inputs
		if(element.classList.contains('swift-box-hidden-input')) {
			return jquery_input_selector(element) && !$(element).closest('swift-box').length;
		}

		// Finally, defer to the original matching function
		return jquery_input_selector(element);
	};

	// Map properties to specific jQuery functions
	var jquery_functions = {
		value : $.fn.val,
		text  : $.fn.text
	};

	// Extend the $.val method
	$.fn.val = function() {
		return prop(this, 'value', arguments);
	};

	// Extend the $.text method
	$.fn.text = function() {
		return prop(this, 'text', arguments);
	};

	var prop = function($this, property, args) {
		if(!$this.length) {
			if(!args.length) {
				return undefined;
			}

			return $this;
		}

		var jquery_function   = jquery_functions[property];
		var swiftbox_function = swiftbox[property];

		var $elements         = args.length ? $this : $this.first();
		var $others           = $elements.not('swift-box');
		var $swiftboxes       = $elements.filter('swift-box');
		var result;

		if($others.length) {
			result = jquery_function.apply($others, args);
		}

		if($swiftboxes.length) {
			var swiftbox_args = Array.prototype.slice.call(args, 0);
			swiftbox_args.unshift($swiftboxes);

			result = swiftbox_function.apply(null, swiftbox_args);
		}

		return args.length ? $this : result;
	};
}(this.jQuery));
