/*!
 * SwiftBox
 * A lightweight combobox
 * https://github.com/Knotix/SwiftBox/
 *
 * Copyright 2014 Samuel Hodge
 * Released under the GPL license
 * http://www.gnu.org/licenses/gpl.html
 *
 * @TODO: Add support for components when they become relevant
 */

(function(context, window) {
	'use strict';

	/* global swiftcore */

	// Add SwiftBox to the current context
	context.swiftbox = swiftbox;

	// =========================================================================
	// Browser Normalization
	// =========================================================================

	// Get the CSS url so shadow DOM can import the stylesheet
	var scripts           = document.scripts;
	var current_script    = scripts[scripts.length - 1];
	var import_style_href = current_script.getAttribute('data-style');

	// Determine if components can be used
	var use_components = false && swiftcore.supports.components && import_style_href;

	// Import rule for shadow DOM
	var component_style_import = use_components ? '<style>@import url(' + import_style_href + ');</style>' : '';

	// =========================================================================
	// Common variables
	// =========================================================================

	// Used to cache element data for performance
	var element_cache = [];

	// Stores the option arrays
	var option_arrays = [];

	// Stores a map between value and index for each option array
	var option_array_value_maps = [];

	// Stores config objects
	var config_objects = [];

	// Stores the currently active select
	var active_select = null;

	// Stores the current list of filtered options
	var filtered_option_array = [];

	// Stores the currently highlighted option's index
	var highlighted_option_index = null;

	// The maximum number of visible options
	var max_visible_options = 10;

	// RegExp used to escape RegExp special characters
	var escape_regex = /([-[\]{}()*+?.,\\^$|#\s])/g;

	// RegExp used to remove leading/trailing whitespace
	var trim_regexp = /^\s+|\s+$/g;

	// RegExp used to remove tags from option text
	var tag_regexp = /<[^>]+>/g;

	// Hidden input container template
	var hidden_input_container       = document.createElement('div');
	hidden_input_container.className = 'swift-box-hidden-input-container';

	// Hidden input template
	var hidden_input       = document.createElement('input');
	hidden_input.className = 'swift-box-hidden-input';
	hidden_input.type      = 'hidden';

	// Shadow root shim
	var shadow_root_shim = document.createElement('div');
	shadow_root_shim.className = 'swift-box-shadow-root';

	// =========================================================================
	// Custom Components
	// =========================================================================

	// Register the elements as components if supported
	if(use_components) {
		document.registerElement('swift-box', {
			prototype: Object.create(HTMLElement.prototype)
		});

		document.registerElement('swift-box-options', {
			prototype: Object.create(HTMLElement.prototype)
		});
	}
	// Otherwise, create the tags for styling compatibilty
	else {
		document.createElement('swift-box');
		document.createElement('swift-box-options');
	}

	// =========================================================================
	// Templates
	// =========================================================================

	var input_html = [
		'<template class="swift-box-hidden">',
			component_style_import,

			'<div class="swift-box">',
				'<div class="swift-box-text"></div>',
				'<div class="swift-box-button">&#9660;</div>',
			'</div>',
		'</template>'
	].join('');

	var options_html = [
		'<template class="swift-box-hidden">',
			component_style_import,
			'<div class="swift-box-options swift-box-hidden">',
				'<div class="swift-box-option-filter-container">',
					'<input class="swift-box-option-filter-input" tabindex="-1" size="1" placeholder="Filter">',

					'<div class="swift-box-option-helpers">',
						'<div class="swift-box-option-helper swift-box-option-check-all">Check all visible</div>',
						'<div class="swift-box-option-helper swift-box-option-clear">Clear selected</div>',
					'</div>',
				'</div>',

				'<div class="swift-box-option-scroll">',
					'<div class="swift-box-option-sizer"></div>',
					'<div class="swift-box-option-list">',
						new Array(max_visible_options + 2).join([
							'<div class="swift-box-option">',
								'<span class="swift-box-option-state"></span>',
								'<span class="swift-box-option-text"></span>',
							'</div>'
						].join('')),
					'</div>',
				'</div>',

				'<div class="swift-box-option-none">No Options Found</div>',
			'</div>',
		'</template>'
	].join('');

	// Convert the templates to elements and append them to the document
	var tmp_dom        = document.createElement('div');
	tmp_dom.innerHTML  = input_html;
	var input_template = tmp_dom.children[0];

	var tmp_dom          = document.createElement('div');
	tmp_dom.innerHTML    = options_html;
	var options_template = tmp_dom.children[0];

	document.documentElement.appendChild(input_template);
	document.documentElement.appendChild(options_template);

	// Get the DOM from the template
	var input_template_dom   = input_template.content || input_template.children[0];
	var options_template_dom = options_template.content || options_template.children[0];

	// =========================================================================
	// Option List
	// =========================================================================

	// Create the option list - Use document.createElement for compatibility
	var swift_box_options = document.createElement('swift-box-options');

	// Append the option list to the body when it is ready
	swiftcore.on(document, 'DOMContentLoaded', appendOptionList);
	if(document.readyState === 'interactive') {
		appendOptionList();
	}

	/**
	 * Appends the option list to the document's body
	 */
	function appendOptionList() {
		document.body.appendChild(swift_box_options);
	}

	// Create the shadow root for the option list
	var options_shadow_root = createShadowRoot(swift_box_options, options_template_dom);

	// Store some references to important option list elements
	var option_container = options_shadow_root.querySelector('.swift-box-options');
	var filter_input     = options_shadow_root.querySelector('.swift-box-option-filter-input');
	var option_check_all = options_shadow_root.querySelector('.swift-box-option-check-all');
	var option_clear     = options_shadow_root.querySelector('.swift-box-option-clear');
	var option_scroll    = options_shadow_root.querySelector('.swift-box-option-scroll');
	var option_sizer     = options_shadow_root.querySelector('.swift-box-option-sizer');
	var option_list      = options_shadow_root.querySelector('.swift-box-option-list');
	var option_elements  = options_shadow_root.querySelectorAll('.swift-box-option');

	// =========================================================================
	// Event Handlers
	// =========================================================================

	// Clicking the option list refocuses the filter input
	swiftcore.on(option_container, 'mouseup', function() {
		filter_input.focus();
	});

	// Typing within the filter input filters the options
	swiftcore.on(filter_input, 'keyup', function(e) {
		var value      = this.value;
		var last_value = this.getAttribute('data-swift-box-last-text');

		// Determine if the filter text has changed
		// Backspace is checked specifically to allow the user to jump to the
		// top of the list even if there is no filter text
		var filter_changed = value !== last_value || e.which === 8;

		if(filter_changed) {
			filterOptions(value, true);

			this.setAttribute('data-swift-box-last-text', value);
		}
	});

	// Clicking the "check all" button selects all visible options on multi-selects
	swiftcore.on(option_check_all, 'click', function() {
		if(getDisabled(active_select)) {
			return;
		}

		selectAll(active_select, true);
	});

	// Clicking the clear button clears the selected values
	swiftcore.on(option_clear, 'click', function() {
		if(getDisabled(active_select)) {
			return;
		}

		setSelectedIndexes(active_select, [], true);
	});

	// Scrolling renders the options
	swiftcore.on(option_scroll, 'scroll', function() {
		renderOptions();
	});

	// Hovering over an option highlights it
	swiftcore.on(option_list, 'mouseover', '.swift-box-option', function() {
		var filtered_index = this.getAttribute('data-swift-box-filtered-index');
		highlightOption(filtered_index);
	});

	// Clicking an option selects it
	swiftcore.on(option_list, 'mouseup', '.swift-box-option', function(e) {
		if(e.which !== 1 || getDisabled(active_select)) {
			return;
		}

		// Highlight the option
		var filtered_index = this.getAttribute('data-swift-box-filtered-index');
		highlightOption(filtered_index);

		// Select the option
		selectHighlightedOption();

		// For single selects, hide the options when one is clicked
		if(!getMultiple(active_select)) {
			hideOptions(true);
		}
	});

	// Clicking a select toggles the option list
	swiftcore.on(document, 'click', 'swift-box', function() {
		if(this === active_select || getDisabled(this)) {
			hideOptions(true);
		}
		else {
			showOptions(this);
		}
	});

	// Add the focus class when focused
	swiftcore.on(document, 'focus', 'swift-box', function() {
		if(this !== active_select && !getDisabled(this)) {
			addFocusClass(this);
		}
	}, true);

	// Remove the focus class when blurred
	swiftcore.on(document, 'blur', 'swift-box', function() {
		if(this !== active_select) {
			removeFocusClass(this);
		}
	}, true);

	// Pressing down arrow or letter keys shows the option list
	swiftcore.on(document, 'keydown keypress', 'swift-box', function(e) {
		if(e.ctrlKey || this === active_select || getDisabled(this)) {
			return;
		}

		var which = e.which;
		var show  = false;

		if(e.type === 'keypress') {
			show = which >= 32 || which === 8;
		}
		else {
			show = which === 40;

			// Because we use an <a> tag to allow tabbing into the select, we need
			// to prevent the enter key from triggering a "click" event on it
			if(which === 13) {
				e.preventDefault();

				// If we are not showing the options, submit the parent form
				if(!show) {
					var form = swiftcore.closest(this, 'form');

					if(form) {
						form.submit();
					}
				}
			}
		}

		if(show) {
			showOptions(this);
			e.preventDefault();

			if(e.type === 'keypress' && which >= 32) {
				var character = String.fromCharCode(which);
				filter_input.value = character;
			}
		}
	});

	// Arrow keys maneuver through the option list
	swiftcore.on(filter_input, 'keydown', function(e) {
		if(!active_select) {
			return;
		}

		var keyCode = e.which;

		if(keyCode === 38 || keyCode === 40) {
			var index = highlighted_option_index;

			if(keyCode === 38) {
				--index;
			}
			else {
				++index;
			}
			highlightOption(index, true);

			// Prevent the text cursor from jumping to home/end
			e.preventDefault();
		}
	});

	// Tab/Enter selects the highlighted option
	swiftcore.on(document, 'keydown', function(e) {
		if(!active_select) {
			return;
		}

		var keyCode = e.which;

		if(keyCode === 9 || keyCode === 13) {
			// Prevent form submissions
			if(keyCode === 13) {
				e.preventDefault();
			}

			// In singular mode, tab or enter selects the current option and hides the options
			if(!getMultiple(active_select)) {
				selectHighlightedOption();
				hideOptions(true);
			}
			// In multiple mode
			else {
				// Only the enter key selects options
				if(keyCode === 13) {
					selectHighlightedOption();
				}
				// The tab key hides options and moves to the next field
				else {
					hideOptions(true);
					active_select.focus()
				}
			}
		}
	});

	// Escape hides the options
	swiftcore.on(document, 'keydown', function(e) {
		var keyCode = e.which;

		if(active_select && keyCode === 27) {
			hideOptions(true);
		}
	});

	// Clicking anywhere in the document hides the options
	swiftcore.on(document, 'mousedown', function(e) {
		if(!active_select) {
			return;
		}

		// Check if the target of the click is within the option list
		if(swiftcore.closest(e.target, 'swift-box, swift-box-options')) {
			filter_input.focus();
		}
		else {
			removeFocusClass(active_select);
			hideOptions();
		}
	});

	// Shim label behavior
	swiftcore.on(document, 'click', 'label', function() {
		var for_target = this.getAttribute('for');
		var element;

		// Get the element the label is linked to
		if(for_target) {
			element = document.getElementById(for_target);
		}
		else {
			element = this.querySelector('swift-box');
		}

		if(element && element !== active_select && element.tagName === 'SWIFT-BOX') {
			showOptions(element);
		}
	});

	// Shim form reset behavior
	swiftcore.on(document, 'reset', 'form', function(e) {
		if(e.defaultPrevented) {
			return;
		}

		var elements = this.getElementsByTagName('swift-box');

		for(var i = 0; i < elements.length; ++i) {
			var element     = elements[i];
			var option_hash = getOptionHash(element);

			setOptionHash(element, option_hash);
		}
	});

	// Resizing the window repositions the option list
	swiftcore.on(window, 'resize', function() {
		if(active_select) {
			positionOptions();
		}
	});

	// =========================================================================
	// Initiliazation
	// =========================================================================

	/**
	 * Converts select elements into SwiftBoxes
	 * @return {Array} An array of SwiftBoxes
	 */
	function swiftbox(elements, config) {
		// If a selector was passed in, query the DOM and initialize the results
		if(typeof elements === 'string') {
			elements = document.querySelectorAll(elements);
			return swiftbox(elements, config);
		}

		elements = normalizeElementArray(elements);

		var new_elements = [];

		for(var i = 0; i < elements.length; ++i) {
			var element = elements[i];
			var tag     = element.tagName.toLowerCase();

			// If the element is already initialized, we're done
			if(tag === 'swift-box') {
				new_elements.push(element);
				continue;
			}

			// Make sure the element is a select
			if(tag !== 'select') {
				throw new Error('Invalid element "' + tag + '". Expected "select"');
			}

			// Create the new element
			var new_element = document.createElement('swift-box');

			// Append the select template to the new element
			createShadowRoot(new_element, input_template_dom);

			// Copy all attributes from the select to the new element
			var attributes = element.attributes;
			for(var j = 0; j < attributes.length; ++j) {
				var attribute = attributes[j];

				// Classes need to be appended to the new element
				if(attribute.name === 'class') {
					new_element.className += ' ' + attribute.value;
				}
				// All other attributes except name are directly copied
				else if(attribute.name !== 'name') {
					new_element.setAttribute(attribute.name, attribute.value);
				}
			}

			// Store the name property for use later within hidden inputs
			new_element.setAttribute('data-swift-box-name', element.name);

			// Add a container for hidden inputs
			new_element.appendChild(hidden_input_container.cloneNode(true));

			// Replace the old element
			var parent_node = element.parentElement;
			if(parent_node) {
				parent_node.insertBefore(new_element, element);
				parent_node.removeChild(element);
			}

			// Extract existing options
			var option_array = extractOptionArrayFromSelect(element);
			setOptionArray(new_element, option_array, null);

			// Ensure a tabindex
			new_element.tabIndex = element.tabIndex || 0;

			new_elements.push(new_element);
		}


		// Stores the elements needing configuration
		var config_elements;

		// If a config object was passed, all elements receive the config
		if(config) {
			config_elements = new_elements;
		}
		// Otherwise, only non-configured elements receive the config
		else {
			config_elements = [];

			for(var i = 0; i < new_elements.length; ++i) {
				var element = new_elements[i];

				if(!element.hasAttribute('data-swift-box-config')) {
					config_elements.push(element);
				}
			}
		}

		// Add the configuration to the new elements
		if(config_elements.length) {
			config = swiftcore.extend({}, defaults, config);
			setConfig(config_elements, config);
		}

		return new_elements;
	}

	/**
	 * Caches elements within a SwiftBox for quicker retrieval
	 * @param  {Object} element The SwiftBox element
	 * @return {Object}         An object containing references to various elements within the shadow DOM
	 * @todo Implement weakmaps when they are relevant
	 */
	function getElementCache(element) {
		element = normalizeElementArray(element)[0];

		if(!element) {
			return {};
		}

		if(element.__swift_box__ === undefined) {
			element.__swift_box__ = element_cache.length;

			var shadow_root;

			if(use_components) {
				shadow_root = element.shadowRoot || element.webkitShadowRoot;
			}
			else {
				shadow_root = element.querySelector('.swift-box-shadow-root');
			}

			element_cache.push({
				container       : shadow_root.querySelector('.swift-box'),
				text            : shadow_root.querySelector('.swift-box-text'),
				button          : shadow_root.querySelector('.swift-box-button'),
				input_container : element.querySelector('.swift-box-hidden-input-container')
			});
		}

		return element_cache[element.__swift_box__];
	}

	// =========================================================================
	// Config Option Manipulation
	// =========================================================================

	var defaults = {
		filter_function: defaultFilter
	};

	/**
	 * Merges a set of config options and makes them part of the default
	 * @param {Object} config A config object
	 */
	function setDefaultConfig(config) {
		swiftcore.extend(defaults, config);
	}

	/**
	 * Sets the configuration object on a select
	 * @param {Array}  elements The SwiftBox elements
	 * @param {Object} config   The configuration object to set
	 */
	function setConfig(elements, config) {
		elements = normalizeElementArray(elements);

		for(var i = 0; i < elements.length; ++i) {
			var element         = elements[i];
			var index           = config_objects.length;
			var existing_config = getConfig(element);
			var new_config      = swiftcore.extend({}, defaults, existing_config, config);

			config_objects.push(new_config);
			element.setAttribute('data-swift-box-config', index);
		}
	}

	/**
	 * Gets the configuration object on a select
	 * @param  {Object} element The SwiftBox element
	 * @return {Object}         The configuration object
	 */
	function getConfig(element) {
		element   = normalizeElementArray(element)[0];
		var index = element && element.getAttribute('data-swift-box-config');

		return config_objects[index];
	}

	/**
	 * Gets a single configuration option on a select
	 * @param {Object} element The SwiftBox element
	 * @param {String} option  The option to get
	 */
	function getConfigOption(element, option) {
		var config = getConfig(element);

		return config && config[option];
	}

	// =========================================================================
	// Option Array Manipulation
	// =========================================================================

	/**
	 * Sets the options on a select
	 *
	 * Accepts the following formats:
	 * {
	 *     123: 'foo',
	 *     456: 'bar'
	 * }
	 * or
	 * [
	 *     {value: 123, text: 'foo'},
	 *     {value: 456, text: 'bar'}
	 * ]
	 *
	 * Be aware that some browsers do not maintain key order within objects, so
	 * the first method may break when the sort_function argument is explicitly set to null
	 *
	 * @param {Array}   elements          The SwiftBox elements
	 * @param {Array}   option_array      The options to set
	 * @param {Array}   sort_function     A sort function to run on the options. Passing undefined or true will sort the
	 *                                    options by text. Passing null will maintain the existing order.
	 * @param {Boolean} remove_duplicates Set to true to remove duplicate values
	 */
	function setOptionArray(elements, option_array, sort_function, remove_duplicates) {
		elements = normalizeElementArray(elements);

		// Normalize the option array
		var normalized_option_array = normalizeOptionArray(option_array, sort_function, remove_duplicates);
		var option_array_index;

		if(normalized_option_array.array.length) {
			// Check if the option array already exists
			option_array_index = findOptionArray(normalized_option_array.array);

			// Add the option array if it does not exist
			if(option_array_index === -1) {
				option_array_index = option_arrays.length;

				option_arrays.push(normalized_option_array.array);
				option_array_value_maps.push(normalized_option_array.map);
			}
		}

		// Set the option hash on the elements
		setOptionHash(elements, option_array_index);
	}

	/**
	 * Gets the option array on a select
	 * @param  {Object} element The SwiftBox element
	 * @return {Array}
	 */
	function getOptionArray(element) {
		var hash = getOptionHash(element);

		return option_arrays[hash];
	}

	/**
	 * Add options to a select
	 * @param {Array}   elements          The SwiftBox elements
	 * @param {Array}   option_array      The options to add
	 * @param {Array}   sort_function     A sort function to run on the options. Passing undefined or true will sort the
	 *                                    options by text. Passing null will maintain the existing order.
	 * @param {Boolean} remove_duplicates Set to true to remove duplicate values
	 */
	function addOptionArray(elements, option_array, sort_function, remove_duplicates) {
		elements = normalizeElementArray(elements);

		var normalized_option_array = normalizeOptionArray(option_array);

		for(var i = 0; i < elements.length; ++i) {
			var element               = elements[i];
			var existing_option_array = getOptionArray(element) || [];
			var new_option_array      = existing_option_array.concat(normalized_option_array.array);

			setOptionArray(element, new_option_array, sort_function, remove_duplicates);
		}
	}

	/**
	 * Removes a list of values from a select's options
	 * @param {Array} elements    The SwiftBox elements
	 * @param {Array} value_array An array of values to remove
	 */
	function removeOptions(elements, value_array) {
		elements = normalizeElementArray(elements);

		if(!(value_array instanceof Array)) {
			value_array = [value_array];
		}

		// Convert the values to strings
		for(var i = 0; i < value_array.length; ++i) {
			value_array[i] = value_array[i] + '';
		}

		for(var i = 0; i < elements.length; ++i) {
			var element               = elements[i];
			var existing_option_array = getOptionArray(element);
			var new_option_array      = [];

			if(!existing_option_array) {
				return;
			}

			for(var j = 0; j < existing_option_array.length; ++j) {
				var option = existing_option_array[j];

				if(value_array.indexOf(option.value) === -1) {
					new_option_array.push(option);
				}
			}

			// Set the option array.
			// Preserve the order of the original array
			setOptionArray(element, new_option_array, null);
		}
	}

	/**
	 * Sets the option hash on SwiftBoxes
	 * @param {Array}  elements The SwiftBox elements
	 * @param {Number} hash     The hash to set
	 */
	function setOptionHash(elements, hash) {
		elements = normalizeElementArray(elements);

		var option_array;

		if(hash === undefined || hash === null) {
			hash         = '';
			option_array = [];
		}
		else {
			option_array = option_arrays[hash];

			if(!option_array) {
				throw new Error('Invalid option hash: ' + hash);
			}
		}

		// Calculate the width of the options
		var option_width = calculateWidth(elements, option_array);

		// Get any options marked as selected
		var selected_indexes = [];

		for(var i = 0; i < option_array.length; ++i) {
			var option = option_array[i];

			if(option.selected) {
				selected_indexes.push(i);
			}
		}

		// Set the option hash on each element
		for(var i = 0; i < elements.length; ++i) {
			var element     = elements[i];
			var is_multiple = getMultiple(element);

			// Set the new option hash
			element.setAttribute('data-swift-box-options', hash);

			if(is_multiple || selected_indexes.length) {
				setSelectedIndexes(element, selected_indexes);
			}
			else if(!is_multiple) {
				setSelectedIndexes(element, 0);
			}

			// Set the width of the element to match the options
			element.style.width = option_width + 'px';

			// Cache the width
			element.setAttribute('data-swift-box-width', option_width);
		}
	}

	/**
	 * Gets the option hash on a SwiftBox
	 * @param  {Array}  element The SwiftBox element
	 * @return {Number}         The option hash
	 */
	function getOptionHash(element) {
		element = normalizeElementArray(element)[0];

		return element && element.getAttribute('data-swift-box-options');
	}

	/**
	 * Converts an array of options into an optimized array for internal use
	 * @param  {Array}   option_array      The options to add
	 * @param  {Array}   sort_function     A sort function to run on the options. Passing undefined or true will sort
	 *                                     the options by text. Passing null will maintain the existing order.
	 * @param  {Boolean} remove_duplicates Set to true to remove duplicate values
	 * @return {Array}                     The normalized option array
	 */
	function normalizeOptionArray(option_array, sort_function, remove_duplicates) {
		if(option_array === undefined || option_array === null) {
			option_array = [];
		}

		if(typeof option_array !== 'object') {
			throw new Error('Invalid option_array: ' + option_array);
		}

		var array    = [];
		var map      = {};
		var index    = 0;

		for(var key in option_array) {
			if(!option_array.hasOwnProperty(key)) {
				continue;
			}

			var option   = option_array[key];
			var selected = false;
			var value;
			var text;

			if(option !== null && typeof option === 'object') {
				value    = option.value;
				text     = option.text;
				selected = option.selected === true;
			}
			else {
				value = key;
				text  = option;
			}

			if(value === undefined || value === null) {
				throw new Error('No value defined for option at index ' + key);
			}

			if(text === undefined) {
				throw new Error('No text defined for option at index ' + key);
			}

			// Normalize value and text
			value = value + '';
			text  = (text === null ? '' : text) + '';
			text  = text.replace(tag_regexp + '', '').replace(trim_regexp, '');

			var new_option = {
				index          : index,
				selected       : selected,
				value          : value,
				text           : text,
				highlight_text : text
			};

			var existing_index = map[value];

			// If we are removing duplicated, overwrite the option if it exists
			if(remove_duplicates && existing_index !== undefined) {
				array[existing_index] = new_option;
			}
			// Otherwise add the option to the array
			else {
				array.push(new_option);
				map[value] = index;
				++index;
			}
		}

		// Sort the option array if necessary
		if(sort_function !== null && sort_function !== false) {
			// If undefined or true is passed in as the sort function, use the default sort
			if(sort_function === undefined || sort_function === true) {
				sort_function = defaultSort;
			}

			array.sort(sort_function);

			// Update the indexes with the new order
			for(var i = 0; i < array.length; ++i) {
				var option        = array[i];
				option.index      = i;
				map[option.value] = i;
			}
		}

		return {
			array : array,
			map   : map
		};
	}

	/**
	 * Finds an already normalized option array matching a given option array
	 * @param  {Array}  option_array The array of options
	 * @return {Number}              The index of the matching option array with the array of normalized option arrays
	 */
	function findOptionArray(option_array) {
		// Yes, a loop label
		option_array_loop:
		for(var i = 0; i < option_arrays.length; ++i) {
			var existing_option_array = option_arrays[i];

			if(option_array.length !== existing_option_array.length) {
				continue;
			}

			for(var j = 0; j < option_array.length; ++j) {
				var option = option_array[j];
				var existing_option = existing_option_array[j];

				if(
					option.value    !== existing_option.value ||
					option.text     !== existing_option.text ||
					option.selected !== existing_option.selected
				) {
					continue option_array_loop;
				}
			}

			return i;
		}

		return -1;
	}

	/**
	 * Extracts options from a traditional <select>
	 * @param  {Object} select The select
	 * @return {Array}         An array of options
	 */
	function extractOptionArrayFromSelect(select) {
		var options = select.options;
		var result  = [];

		for(var i = 0; i < options.length; ++i) {
			var option = options[i];

			result.push({
				value    : option.value,
				text     : option.text,
				selected : option.selected
			});
		}

		return result;
	}

	/**
	 * Shows the list of options for a select
	 * @param {Object} element The SwiftBox element
	 */
	function showOptions(element) {
		element = normalizeElementArray(element)[0];

		// If the element is already active, we're done
		if(active_select === element) {
			return;
		}

		// Remove the focus class on the currently active select
		if(active_select) {
			removeFocusClass(active_select);
		}

		// Store this select as the currently active select
		active_select = element;

		// Clear the filter input
		filter_input.value = '';
		filter_input.setAttribute('data-swift-box-last-text', '');

		// Add the focus class to the select for styling
		addFocusClass(element);

		// Toggle the multiple class if the current select allows multiple values
		option_container.classList.toggle('swift-box-option-multiple', getMultiple(element));

		// Size the option list
		var sizer_width  = Math.max(element.getAttribute('data-swift-box-width'), element.offsetWidth);
		option_container.style.minWidth = sizer_width + 'px';

		// Show the option list
		option_container.classList.remove('swift-box-hidden');

		// Reset the filter
		filterOptions('');

		// Position the option list
		positionOptions();

		// Highlight the currently selected option
		var selected_indexes = getSelectedIndexes(element);
		var highlight_index  = selected_indexes[0] || 0;
		highlightOption(highlight_index, true, true);

		// Focus on the filter input
		filter_input.focus();
	}

	/**
	 * Positions the option container appropriately close to the active select
	 */
	function positionOptions() {
		var bounding_rectangle = active_select.getBoundingClientRect();
		var window_width       = window.innerWidth;
		var window_height      = window.innerHeight;

		var top_edge    = bounding_rectangle.bottom;
		var left_edge   = bounding_rectangle.left;
		var right_edge  = left_edge + option_container.offsetWidth;
		var bottom_edge = top_edge + option_container.offsetHeight;

		var top    = top_edge;
		var right  = null;
		var bottom = null;
		var left   = left_edge;

		// Save the current scroll position within the options
		var scroll_top  = option_scroll.scrollTop;
		var scroll_left = option_scroll.scrollLeft;

		// Prevent the list from going off the page
		if(bottom_edge >= window_height) {
			top    = null;
			bottom = window_height - bounding_rectangle.top;

			option_container.classList.add('swift-box-options-bottom');
			option_container.insertBefore(option_scroll, option_container.children[0]);
		}
		else {
			option_container.classList.remove('swift-box-options-bottom');
			option_container.appendChild(option_scroll);
		}

		if(left <= 0) {
			left = 0;
		}
		else if(right_edge >= window_width) {
			right = 0;
			left = null;
		}

		// Position the option list
		option_container.style.top    = top === null ? 'auto' : top + 'px';
		option_container.style.right  = right === null ? 'auto' : right + 'px';
		option_container.style.bottom = bottom === null ? 'auto' : bottom + 'px';
		option_container.style.left   = left === null ? 'auto' : left + 'px';

		// Restore the scroll position
		option_scroll.scrollTop = scroll_top;
		option_scroll.scrollLeft = scroll_left;

		// Focus on the filter input
		filter_input.focus();
	}

	/**
	 * Filters the list of options for a select
	 * @param  {String} filter_text The text to filter the options by
	 */
	function filterOptions(filter_text) {
		// Normalize the filter text
		if(filter_text === undefined || filter_text === null) {
			filter_text = '';
		}
		filter_text += '';

		// Get the options for the active select
		var option_array = getOptionArray(active_select) || [];

		// Filter only if text was passed in
		if(filter_text.length) {
			var filter_function = getConfigOption(active_select, 'filter_function');

			if(typeof filter_function !== 'function') {
				throw new Error('Invalid filter function: ' + filter_function);
			}

			filtered_option_array = filter_function(filter_text, option_array);
		}
		// Otherwise, reset the filtered options to the full option array
		else {
			for(var i = 0; i < option_array.length; ++i) {
				var option = option_array[i];
				option.highlight_text = option.text;
			}

			filtered_option_array = option_array;
		}

		// Show the empty message if no options match the filter
		option_container.classList.toggle('swift-box-option-empty', !filtered_option_array.length);

		// Get some dimensions
		var option_height        = getOptionHeight();
		var container_max_height = option_height * max_visible_options;
		var sizer_height         = option_height * filtered_option_array.length;

		option_scroll.scrollTop       = 0;
		option_scroll.scrollLeft      = 0;
		option_scroll.style.maxHeight = container_max_height + 'px';
		option_sizer.style.height     = sizer_height + 'px';

		// Highlight the first match
		highlightOption(0, true, true);
	}

	/**
	 * Renders the options for a select, calculating which options to show
	 * based on the scroll position
	 * @param  {Number} scroll_top The scroll position of the options
	 */
	function renderOptions(scroll_top) {
		// Hide all options initially
		for(var i = 0; i < option_elements.length; ++i) {
			option_elements[i].classList.add('swift-box-hidden');
		}

		// If there are no options, we're done
		if(!filtered_option_array.length) {
			return;
		}

		// If no scroll position was passed in, use the current position
		if(scroll_top === undefined) {
			scroll_top = option_scroll.scrollTop;
		}
		// Otherwise set the scroll position on the element
		else {
			option_scroll.scrollTop = scroll_top;
		}

		// In IE8, setting the scrollTop too high results in a rendering bug,
		// so snap it to the bottom if needed
		scroll_top = Math.min(scroll_top, option_scroll.scrollHeight - option_scroll.offsetHeight);

		// Store the height of a single option
		var option_height = getOptionHeight();

		// Get the currently selected indexes
		var selected_indexes = getSelectedIndexes(active_select);

		// Calculate the position of the visible options within the scrollable area
		option_list.style.top = (scroll_top - (scroll_top % option_height)) + 'px';

		// Calculate which options to show based on the scroll position
		var offset = Math.max(Math.floor(scroll_top / option_height), 0);
		var limit  = Math.min(max_visible_options + 1, filtered_option_array.length - offset);

		// For each visible option
		for(var i = 0; i < limit; ++i) {
			var filtered_index = i + offset;
			var option         = filtered_option_array[filtered_index];
			var option_index   = option.index;
			var option_element = option_elements[i];

			option_element.setAttribute('data-swift-box-filtered-index', filtered_index);
			option_element.querySelector('.swift-box-option-text').innerHTML = option.highlight_text;

			option_element.classList.remove('swift-box-hidden');
			option_element.classList.toggle('swift-box-option-highlight', filtered_index === highlighted_option_index);
			option_element.classList.toggle('swift-box-option-selected', selected_indexes.indexOf(option_index) !== -1);
		}
	}

	/**
	 * Hides the option list
	 */
	function hideOptions(refocus) {
		// Hide the option list
		option_container.classList.add('swift-box-hidden');

		// Refocus on the
		if(refocus && active_select) {
			active_select.focus();
		}

		active_select = null;
	}

	/**
	 * Highlights an option in the option list, scrolling to it if needed
	 * @param  {Number}  index  The option index to highlight
	 * @param  {Boolean} scroll Set to true to scroll the option into view
	 * @param  {Boolean} top    Set to true to scroll the option to the top of the list
	 */
	function highlightOption(index, scroll, top) {
		scroll = scroll || top;

		var scroll_height = option_scroll.offsetHeight;
		var option_height = getOptionHeight();

		index = +index || 0;
		index = Math.max(index, 0);
		index = Math.min(index, filtered_option_array.length -1);

		var scroll_top;

		if(scroll) {
			scroll_top     = option_scroll.scrollTop;
			var option_top = index * option_height;

			if(option_top < scroll_top) {
				scroll_top = option_top;
			}
			else if(scroll_top + scroll_height <= option_top) {
				if(top) {
					scroll_top = option_top;
				}
				else {
					scroll_top = option_top - scroll_height + option_height;
				}
			}
		}

		highlighted_option_index = index;
		renderOptions(scroll_top);
	}

	/**
	 * Selects the currently highlighted option and assigns its value to the currently active select
	 */
	function selectHighlightedOption() {
		var option = filtered_option_array[highlighted_option_index];
		if(option === undefined) {
			return;
		}

		var index            = option.index;
		var selected_indexes = index;

		// Multi-selects need to toggle the selected option based on if it
		// already exists within the selected options or not
		if(getMultiple(active_select)) {
			var selected_indexes = getSelectedIndexes(active_select);
			var exists           = selected_indexes.indexOf(index);

			// If the option isn't selected, select it
			if(exists === -1) {
				selected_indexes.push(index);
			}
			// Otherwise, deselect it
			else {
				selected_indexes.splice(exists, 1);
			}
		}

		// Set the new selected indexes
		setSelectedIndexes(active_select, selected_indexes, true);
	}

	/**
	 * Calculates the height of a single option
	 * Additionally, this forces the all options to have the same height to account for rounding by the browser
	 * @return {[type]} [description]
	 */
	function getOptionHeight() {
		// Reset the height on the elements
		for(var i = 0; i < option_elements.length; ++i) {
			var option_element              = option_elements[i];
			option_element.style.height     = '';
			option_element.style.lineHeight = '';
		}

		// Get the height of the first element
		var first_option  = option_elements[0];
		var hidden        = first_option.classList.contains('swift-box-hidden');

		first_option.classList.remove('swift-box-hidden');
		var height = Math.round(first_option.offsetHeight);
		first_option.classList.toggle('swift-box-hidden', hidden);

		// Set the height on the elements so they are all uniform.
		// This prevents the browser from using relative pixel widths
		// that may result in arbitrary rounding during rendering
		for(var i = 0; i < option_elements.length; ++i) {
			var option_element              = option_elements[i];
			option_element.style.height     = height + 'px';
			option_element.style.lineHeight = height + 'px';
		}

		return height;
	}

	/**
	 * Gets the option value map for a select
	 * @param  {Object}      element The SwiftBox element
	 * @return {Object|null}         The value map or null if no options are set
	 */
	function getOptionValueMap(element) {
		var hash = getOptionHash(element);

		return option_array_value_maps[hash];
	}

	/**
	 * Calculates the width of the select based on the widest option.
	 * In older browsers that don't support canvas, the width is
	 * approximated, possibly failing miserably.
	 * @param  {Object} element      The SwiftBox element
	 * @param  {Array}  option_array The array of options
	 * @return {Number}              The calculated width
	 */
	function calculateWidth(element, option_array) {
		element = normalizeElementArray(element)[0];

		if(!element || !option_array || !option_array.length) {
			return 0;
		}

		option_array = option_array || [];

		var computed_style;
		var font_size;
		var font_family;

		if(window.getComputedStyle) {
			computed_style = window.getComputedStyle(element);
			font_size      = computed_style.getPropertyValue('font-size');
			font_family    = computed_style.getPropertyValue('font-family');
		}
		else {
			computed_style = window.getComputedStyle(element);
			font_size      = computed_style['font-size'];
			font_family    = computed_style['font-family'];
		}

		// For performance, only compare the longest of the options
		var compare_limit = 100;
		if(option_array.length > compare_limit) {
			var tmp_option_array = option_array.slice(0);
			tmp_option_array.sort(lengthSort);

			option_array = tmp_option_array.slice(0, compare_limit);
		}

		var max_width = 0;

		for(var i = 0; i < option_array.length; ++i) {
			var option = option_array[i];
			var size   = swiftcore.measureText(option.text, font_size, font_family);
			max_width  = Math.max(size.width, max_width);
		}

		// Add the button's width
		max_width += getElementCache(element).button.offsetWidth;

		// Add some extra pixels to account for padding and scrollbars
		max_width += 25;

		return max_width;
	}

	/**
	 * Toggles multi-select mode on SwiftBoxes
	 * @param {Array}   elements The SwiftBox elements
	 * @param {Boolean} multiple Set to true to enable multi-select mode
	 */
	function setMultiple(elements, multiple) {
		elements = normalizeElementArray(elements);

		for(var i = 0; i < elements.length; ++i) {
			var element = elements[i];

			if(multiple) {
				element.setAttribute('multiple', '');
			}
			else {
				element.removeAttribute('multiple');

				var selected_indexes = getSelectedIndexes(element);
				setSelectedIndexes(element, selected_indexes[0] || 0);
			}
		}
	}

	/**
	 * Determines if a SwiftBox is in multi-select mode
	 * @param  {Object}  element The SwiftBox element
	 * @return {Boolean}
	 */
	function getMultiple(element) {
		element = normalizeElementArray(element)[0];

		return element && element.hasAttribute('multiple');
	}

	/**
	 * Toggles disabled state on SwiftBoxes
	 * @param {Array}   elements The SwiftBox elements
	 * @param {Boolean} multiple Set to true to disable
	 */
	function setDisabled(elements, disabled) {
		elements = normalizeElementArray(elements);

		for(var i = 0; i < elements.length; ++i) {
			var element           = elements[i];
			var container_element = getElementCache(element).container;

			if(disabled) {
				element.setAttribute('disabled', '');
				container_element.removeAttribute('href');
			}
			else {
				element.removeAttribute('disabled');
				container_element.href = '#';
			}
		}
	}

	/**
	 * Determines if a select is disabled
	 * @param  {Object}  element The SwiftBox element
	 * @return {Boolean}
	 */
	function getDisabled(element) {
		element = normalizeElementArray(element)[0];

		return element && element.hasAttribute('disabled');
	}

	// =========================================================================
	// Value Manipulation
	// =========================================================================

	/**
	 * Gets all selected values of a select
	 * @param  {Object} element The SwiftBox element
	 * @return {Array}
	 */
	function getValues(element) {
		element              = normalizeElementArray(element)[0];
		var selected_indexes = getSelectedIndexes(element);
		var option_array     = getOptionArray(element);
		var values           = [];

		if(!option_array) {
			return [];
		}

		for(var i = 0; i < selected_indexes.length; ++i) {
			var index  = selected_indexes[i];
			var option = option_array[index];

			if(option) {
				values.push(option.value);
			}
		}

		return values;
	}

	/**
	 * Sets the selected values of a select
	 * @param {Array}        elements       The SwiftBox elements
	 * @param {String|Array} indexes        A value or array of values to select
	 * @param {Boolean}      trigger_change Set to true to trigger a change event if the values have changed
	 */
	function setValues(elements, values, trigger_change) {
		elements = normalizeElementArray(elements);

		if(!(values instanceof Array)) {
			values = [values];
		}

		// Remove undefined/null values
		var clean_values = [];
		for(var i = 0; i < values.length; ++i) {
			var value = values[i];

			if(value !== undefined && value !== null) {
				clean_values.push(value);
			}
		}

		for(var i = 0; i < elements.length; ++i) {
			var element          = elements[i];
			var option_value_map = getOptionValueMap(element);
			var indexes          = [];

			if(option_value_map) {
				for(var j = 0; j < clean_values.length; ++j) {
					var value = clean_values[j];
					var index = option_value_map[value];

					if(index !== undefined) {
						indexes.push(index);
					}
				}
			}

			setSelectedIndexes(element, indexes, trigger_change);
		}
	}

	/**
	 * Returns if a select has a specific value in its options
	 * @param  {Object}  element The SwiftBox element
	 * @param  {String}  value The value to check for
	 * @return {Boolean}
	 */
	function hasValue(element, value) {
		var option_value_map = getOptionValueMap(element);

		if(option_value_map && option_value_map[value] !== undefined) {
			return true;
		}

		return false;
	}

	/**
	 * Gets all selected indexes of a select
	 * @param  {Object} element The SwiftBox element
	 * @return {Array}
	 */
	function getSelectedIndexes(element) {
		element     = normalizeElementArray(element)[0];
		var indexes = [];

		var tmp_indexes = element && element.getAttribute('data-swift-box-indexes');
		if(tmp_indexes) {
			tmp_indexes = tmp_indexes.split(',');

			for(var i = 0; i < tmp_indexes.length; ++i) {
				var index = +tmp_indexes[i];

				if(isNaN(index)) {
					continue;
				}

				indexes.push(index);
			}
		}

		return indexes;
	}

	/**
	 * Sets the selected indexes of a select
	 * @param {Array}        elements       The SwiftBox elements
	 * @param {Number|Array} indexes        An index or array of indexes to select
	 * @param {Boolean}      trigger_change Set to true to trigger a change event if the indexes have changed
	 */
	function setSelectedIndexes(elements, indexes, trigger_change) {
		elements = normalizeElementArray(elements);

		if(indexes === undefined || indexes === null) {
			indexes = [];
		}
		else if(!(indexes instanceof Array)) {
			indexes = [indexes];
		}

		var used_indexes     = {};
		var changed_elements = [];

		for(var i = 0; i < elements.length; ++i) {
			var element          = elements[i];
			var selected_indexes = getSelectedIndexes(element);
			var option_array     = getOptionArray(element);
			var new_indexes      = [];

			if(option_array) {
				for(var j = 0; j < indexes.length; ++j) {
					var index = +indexes[j];

					if(isNaN(index)) {
						continue;
					}

					if(option_array[index] && !used_indexes[index]) {
						used_indexes[index] = true;

						new_indexes.push(index);
					}
				}

				new_indexes.sort(sortIndexes);
			}

			// Set the new indexes
			element.setAttribute('data-swift-box-indexes', new_indexes.join(','));

			// Update the text
			var text = [];
			for(var j = 0; j < new_indexes.length; ++j) {
				var index  = new_indexes[j];
				var option = option_array[index];

				if(option) {
					text.push(option.text);
				}
			}

			var element_cache = getElementCache(element);
			var text_element  = element_cache.text;
			var new_text      = text.join(', ');

			text_element.textContent = new_text;

			// Get the hidden input container
			var input_container = element_cache.input_container;

			// Clear the existing hidden inputs inside the container
			var first_child;
			while((first_child = input_container.firstChild)) {
				input_container.removeChild(first_child);
			}

			var no_inputs = element.hasAttribute('data-no-inputs');

			if(!no_inputs) {
				// Update the hidden inputs to contain the new values
				var values      = getValues(element);
				var name        = element.getAttribute('data-swift-box-name');
				var input_count = values.length;

				// Single selects must have an input
				if(!input_count && !getMultiple(element)) {
					input_count = 1;
				}

				// Create a hidden input for each value
				for(var j = 0; j < input_count; ++j) {
					var input   = hidden_input.cloneNode(true);
					input.name  = name;
					input.value = values[j] || '';

					input_container.appendChild(input);
				}
			}

			// Trigger a change if the indexes have changed
			if(trigger_change) {
				var changed = new_indexes.length !== selected_indexes.length;

				if(!changed) {
					for(var j = 0; j < new_indexes.length; ++j) {
						if(new_indexes[j] !== selected_indexes[j]) {
							changed = true;
							break;
						}
					}
				}

				if(changed) {
					changed_elements.push(element);
				}
			}

			if(element === active_select) {
				filter_input.focus();
				renderOptions();
			}
		}

		// Trigger any change events
		if(changed_elements.length) {
			swiftcore.trigger(changed_elements, 'change');

			// External code may change the DOM based on the change event
			// Reposition the options to compensate for it
			if(active_select) {
				positionOptions();
			}
		}
	}

	/**
	 * Selects all options on a multi-select(s)
	 * @param {Array}   elements The SwiftBox elements to select all options on
	 * @param {Boolean} filtered If the SwiftBox is active, only select options that have been filtered
	 */
	function selectAll(elements, filtered) {
		elements = normalizeElementArray(elements);

		for(var i = 0; i < elements.length; ++i) {
			var element = elements[i];

			// Make sure the element is a multi-select
			if(!getMultiple(element)) {
				return;
			}

			var selected_indexes   = getSelectedIndexes(element);
			var filtered_only      = filtered && element === active_select;
			var option_array       = filtered_only ? filtered_option_array : getOptionArray(element);
			var new_indexes        = [];
			var index_map          = {};
			var trigger_change     = false;

			// Get the currently selected indexes
			for(var j = 0; j < selected_indexes.length; ++j) {
				var index = selected_indexes[j];

				index_map[index] = true;
			}

			// Check the remaining options
			for(var j = 0; j < option_array.length; ++j) {
				var option = option_array[j];
				var index  = option.index;

				if(!index_map[index]) {
					trigger_change = true;
				}

				index_map[index] = true;
			}

			for(var index in index_map) {
				new_indexes.push(index);
			}

			setSelectedIndexes(element, new_indexes, trigger_change);
		}
	}

	/**
	 * Sets the display text of a select
	 * @param  {Object} element The SwiftBox element
	 * @param  {String} element The text to set
	 */
	function setText(elements, text) {
		var elements = normalizeElementArray(elements);

		if(text === undefined || text === null) {
			text = '';
		}

		text += '';

		for(var i = 0; i < elements.length; ++i) {
			var element = elements[i];
			var text_element = getElementCache(element).text;

			text_element.textContent = text;
		}
	}

	/**
	 * Gets the display text of a select
	 * @param  {Object} element The SwiftBox element
	 * @return {String}
	 */
	function getText(element) {
		var element = normalizeElementArray(element)[0];

		if(!element) {
			return;
		}

		return getElementCache(element).text.textContent;
	}

	/**
	 * Gets the text based on the selected values
	 * @param  {Object} element The SwiftBox element
	 * @return {String|Array}   A string or an array of strings if in multiple mode
	 */
	function getValueText(element) {
		var element = normalizeElementArray(element)[0];

		if(!element) {
			return;
		}

		var selected_indexes = getSelectedIndexes(element);
		var option_array     = getOptionArray(element);

		var text = [];
		for(var i = 0; i < selected_indexes.length; ++i) {
			var index  = selected_indexes[i];
			var option = option_array[index];

			if(option) {
				text.push(option.text);
			}
		}

		return text;
	}

	/**
	 * Marks a select as focused
	 * @param {Object} element The SwiftBox element
	 */
	function addFocusClass(element) {
		element.classList.add('swift-box-focus');
	}

	/**
	 * Unmarks a select as focused
	 * @param {Object} element The SwiftBox element
	 */
	function removeFocusClass(element) {
		element.classList.remove('swift-box-focus');
	}
	
	/**
	 * Sort function for indexes
	 * @param  {Number} a Value A
	 * @param  {Number} b Value B
	 * @return {Number}
	 */
	function sortIndexes(a, b) {
		return a < b ? -1 : 1;
	}

	// =========================================================================
	// Expose methods
	// =========================================================================

	swiftbox.setDefaultConfig = setDefaultConfig;

	swiftbox.config = function(elements, option, value) {
		if(arguments.length <= 1) {
			return swiftcore.extend({}, getConfig(elements));
		}

		// If option is an object, we must be setting multiple config options at once
		if(typeof option === 'object') {
			setConfig(elements, option);
		}
		// If there are only two arguments, we must be getting an option
		else if(arguments.length === 2) {
			return getConfigOption(elements, option);
		}
		// Otherwise, we are setting a single option
		else {
			var config_object = {};
			config_object[option] = value;

			setConfig(elements, config_object);
		}

		return elements;
	};

	swiftbox.options = function(elements) {
		if(arguments.length <= 1) {
			return swiftcore.extend([], getOptionArray(elements));
		}

		setOptionArray.apply(null, arguments);
		return elements;
	};

	swiftbox.addOptions = function(elements) {
		addOptionArray.apply(null, arguments);

		return elements;
	};

	swiftbox.removeOptions = function(elements) {
		removeOptions.apply(null, arguments);

		return elements;
	};

	swiftbox.optionHash = function(elements) {
		if(arguments.length <= 1) {
			return getOptionHash(elements);
		}

		setOptionHash.apply(null, arguments);
		return elements;
	};

	swiftbox.showOptions = function(elements) {
		showOptions.apply(null, arguments);

		return elements;
	};

	swiftbox.filterOptions = function(elements) {
		filterOptions.apply(null, arguments);

		return elements;
	};

	swiftbox.hideOptions = function(elements) {
		hideOptions();
		return elements;
	};

	swiftbox.value = function(elements) {
		if(arguments.length <= 1) {
			var values = getValues(elements);

			// For single selects, convert the value array to a single value
			if(!getMultiple(elements)) {
				values = values[0] || '';
			}

			return values;
		}

		setValues.apply(null, arguments);
		return elements;
	};

	swiftbox.hasValue = function() {
		return hasValue.apply(null, arguments);
	};

	swiftbox.selectedIndex = function(elements) {
		if(arguments.length <= 1) {
			var selected_indexes = getSelectedIndexes(elements);

			if(!getMultiple(elements)) {
				selected_indexes = selected_indexes[0];

				if(selected_indexes === undefined) {
					selected_indexes = -1;
				}
			}

			return selected_indexes;
		}

		setSelectedIndexes.apply(null, arguments);
		return elements;
	};

	swiftbox.selectAll = function(elements) {
		selectAll.apply(null, arguments);

		return elements;
	};

	swiftbox.text = function(elements) {
		if(arguments.length <= 1) {
			return getText(elements);
		}

		setText.apply(null, arguments);
		return elements;
	};

	swiftbox.valueText = function(elements) {
		var text = getValueText(elements);

		if(!getMultiple(elements)) {
			return text[0] || '';
		}

		return text;
	};

	swiftbox.multiple = function(elements) {
		if(arguments.length <= 1) {
			return getMultiple(elements);
		}

		setMultiple.apply(null, arguments);
		return elements;
	};

	swiftbox.disabled = function(elements) {
		if(arguments.length <= 1) {
			return getDisabled(elements);
		}

		setDisabled.apply(null, arguments);
		return elements;
	};

	// =========================================================================
	// Utility functions
	// =========================================================================

	/**
	 * Takes a single element, an array of elements, or a jQuery object and
	 * normalizes it into a predictable array
	 * @param  {Object} element The SwiftBox element
	 * @return {Object}         An array of the passed in elements
	 */
	function normalizeElementArray(elements) {
		if(elements === undefined || elements === null) {
			return [];
		}

		if(elements.length === undefined) {
			return [elements];
		}

		return elements;
	}

	/**
	 * Creates a shadow root using a template
	 * @param  {Object} element  The SwiftBox element
	 * @param  {Object} template An element to be used as a template
	 */
	function createShadowRoot(element, template) {
		var root;

		if(use_components) {
			root = (element.createShadowRoot || element.webkitCreateShadowRoot).call(element);
		}
		else {
			root = shadow_root_shim.cloneNode(true);
			element.appendChild(root);
		}

		// Append the template to the root
		root.appendChild(template.cloneNode(true));

		return root;
	}

	/**
	 * Sorting algorithm for determining the longest options
	 * @param  {Object} a Item A
	 * @param  {Object} b Item B
	 * @return {Number}   The position of A relative to B
	 */
	function lengthSort(a, b) {
		return a.text.length > b.text.length ? -1 : 1;
	}

	/**
	 * The default sorting algorithm used when setting options
	 * @param  {Object} a Item A
	 * @param  {Object} b Item B
	 * @return {Number}   The position of A relative to B
	 */
	function defaultSort(a, b) {
		// Empty values should appear at the top
		if(a.value === '' && a.value !== b.value) {
			return -1;
		}

		if(a.text !== b.text) {
			// Empty text should appear at the top
			if(a.text === '') {
				return -1;
			}

			return a.text < b.text ? -1 : 1;
		}

		return a.value < b.value ? -1 : 1;
	}

	/**
	 * The default filter function used to filter options
	 * @param  {String} needle    The needle to search for
	 * @param  {Array}  haystacks The array of haystacks to search in
	 * @return {Array}            The matching haystacks
	 */
	function defaultFilter(needle, haystacks) {
		needle = needle.replace(escape_regex, '\\$1');

		var results = [];
		var regexp = new RegExp('(' + needle + ')', 'gi');

		for(var i = 0; i < haystacks.length; ++i) {
			var haystack = haystacks[i];
			var text     = haystack.text;
			var matches  = text.match(regexp);

			if(!matches) {
				continue;
			}

			haystack.highlight_text = text.replace(regexp, '<mark>$1</mark>');

			results.push(haystack);
		}

		return results;
	}
}(this, window));
