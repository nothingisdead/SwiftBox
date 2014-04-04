/*!
 * SwiftBox
 * https://github.com/Knotix/SwiftBox/
 *
 * Copyright 2014 Samuel Hodge
 * Released under the GPL license
 * http://www.gnu.org/licenses/gpl.html
 *
 * @TODO: Add support for components when they become relevant
 */

/**
 * In most cases, jQuery is avoided for performance reasons
 */

(function($, window, undefined) {
	'use strict';

	// =========================================================================
	// Browser Normalization
	// =========================================================================

	var document  = window.document;
	var $window   = $(window);
	var $document = $(window.document);

	// Determine how to get an element's text
	var textContent = document.textContent !== undefined ? 'textContent' : 'innerText';

	// Get the CSS url so shadow DOM can import the stylesheet
	var import_style_href = window.swiftbox_style_href;

	// Feature support detection
	var test_element  = document.createElement('div');
	var test_template = document.createElement('template');
	var test_canvas   = document.createElement('canvas');

	var supports = {
		components : !!import_style_href && !!document.register && (!!test_element.createShadowRoot || !!test_element.webkitCreateShadowRoot) && false,
		templates  : !!test_template.content,
		canvas     : !!test_canvas.getContext
	};

	// Determine what element to use for templating (IE compatibility)
	var template_element = supports.templates ? 'template' : 'div';

	// Get the context of the canvas if supported
	var canvas_context = supports.canvas ? test_canvas.getContext('2d') : null;

	// Import rule for shadow DOM
	var component_style_import = supports.components ? '<style>@import url(' + import_style_href + ');</style>' : '';

	// Array.indexOf for IE8
	function indexOf(array, value) {
		if(Array.prototype.indexOf) {
			return Array.prototype.indexOf.call(array, value);
		}

		for(var i = 0; i < array.length; ++i) {
			var test_value = array[i];
			if(value === test_value) {
				return i;
			}
		}

		return -1;
	}

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

	// RegExp used to remove tags from option text
	var tag_regexp = /<[^>]+>/g;

	// Hiddent input container template - raw element for performance
	var hidden_input_container = $('<div class="swift-box-hidden-input-container"></div>').get(0);

	// Hidden input template - raw element for performance
	var hidden_input = $('<input type="hidden" class="swift-box-hidden-input">').get(0);

	// Shadow root shim
	var shadow_root_shim = $('<div class="swift-box-shadow-root"></div>').get(0);

	// =========================================================================
	// Utility functions
	// =========================================================================

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

		if(element.__swiftbox__ === undefined) {
			element.__swiftbox__ = element_cache.length;

			var shadow_root;

			if(supports.components) {
				shadow_root = element.shadowRoot || element.webkitShadowRoot;
			}
			else {
				shadow_root = element.querySelector('.swift-box-shadow-root');
			}

			element_cache.push({
				container : shadow_root.querySelector('.container'),
				text      : shadow_root.querySelector('.text'),
				button    : shadow_root.querySelector('.button')
			});
		}

		return element_cache[element.__swiftbox__];
	}

	// =========================================================================
	// Custom Tags
	// =========================================================================

	// Register the tags as components if supported
	if(supports.components) {
		document.register('swift-box', {
			prototype: Object.create(HTMLElement.prototype)
		});

		document.register('swift-box-options', {
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
		'<' + template_element + ' class="swift-box-hidden">',
			component_style_import,
			'<div class="swift-box">',
				'<a href="#" class="container">',
					'<div class="text"></div>',
					'<div class="button">&#9660;</div>',
				'</a>',
			'</div>',
		'</' + template_element + '>'
	].join('');

	var options_html = [
		'<' + template_element + ' class="swift-box-hidden">',
			component_style_import,
			'<div class="swift-box-options">',
				'<div class="container swift-box-hidden">',
					'<div class="input-container">',
						'<input class="input" tabindex="-1" size="1" placeholder="Filter">',
						'<div class="helpers">',
							'<div class="all helper">Check all visible</div>',
							'<div class="clear helper">Clear selected</div>',
						'</div>',
					'</div>',

					'<div class="scroll">',
						'<div class="sizer"></div>',
						'<div class="list">',
							Array(max_visible_options + 2).join([
								'<div class="option">',
									'<span class="state"></span>',
									'<span class="text"></span>',
								'</div>'
							].join('')),
						'</div>',
						'<div class="none">No Options Found</div>',
					'</div>',
				'</div>',
			'</div>',
		'</' + template_element + '>'
	].join('');

	// Convert the templates to elements and append them to the document
	var input_template   = $(input_html).get(0);
	var options_template = $(options_html).get(0);

	document.documentElement.appendChild(input_template);
	document.documentElement.appendChild(options_template);

	// Get the DOM from the template
	var input_template_dom   = supports.templates ? input_template.content : input_template.firstElementChild;
	var options_template_dom = supports.templates ? options_template.content : options_template.firstElementChild;

	// =========================================================================
	// Option List
	// =========================================================================

	// Create the option list - Use document.createElement for compatibility
	var swiftbox_options = document.createElement('swift-box-options');

	// Create the shadow root for the option list
	var options_shadow_root = createShadowRoot(swiftbox_options, options_template_dom);

	// Store some references to important option list elements
	var $option_container = $('.container', options_shadow_root);
	var $option_input     = $('.input', options_shadow_root);
	var $option_all       = $('.all', options_shadow_root);
	var $option_clear     = $('.clear', options_shadow_root);
	var $option_scroll    = $('.scroll', options_shadow_root);
	var $option_sizer     = $('.sizer', options_shadow_root);
	var $option_list      = $('.list', options_shadow_root);
	var $option_elements  = $('.option', options_shadow_root);

	// =========================================================================
	// Event Handlers
	// =========================================================================

	// Clicking the option list refocuses the filter input
	$option_container.on('mouseup', function() {
		$option_input.focus();
	});

	// Typing within the filter input filters the options
	$option_input.on('keyup', function(e) {
		var value      = this.value;
		var last_value = this.getAttribute('data-last-text');

		if(value !== last_value) {
			filterOptions(value, true);

			this.setAttribute('data-last-text', value);
		}
	});

	// Click the check all button selects all visible options on multi-selects
	$option_all.on('click', function() {
		if(isDisabled(active_select)) {
			return;
		}

		var selected_indexes = getSelectedIndexes(active_select);
		var new_indexes      = [];
		var index_map        = {};

		for(var i = 0; i < selected_indexes.length; ++i) {
			var index = selected_indexes[i];

			index_map[index] = true;
		}

		for(var i = 0; i < filtered_option_array.length; ++i) {
			var filtered_option = filtered_option_array[i];
			var index           = filtered_option.index;

			index_map[index] = true;
		}

		for(var index in index_map) {
			new_indexes.push(index);
		}

		setSelectedIndexes(active_select, new_indexes);
		$option_input.focus();
		renderOptions();
	});

	// Clicking the clear button clears the selected values
	$option_clear.on('click', function() {
		if(isDisabled(active_select)) {
			return;
		}

		setSelectedIndexes(active_select, []);
		$option_input.focus();
		renderOptions();
	});

	// Scrolling renders the options
	$option_scroll.on('scroll', function() {
		renderOptions();
	});

	// Hovering over an option highlights it
	$option_list.on('mouseenter', '.option', function() {
		var filtered_index = this.getAttribute('data-filtered-index');
		highlightOption(filtered_index);
	});

	// Clicking an option selects it
	$option_list.on('mouseup', '.option', function(e) {
		if(e.which !== 1 || isDisabled(active_select)) {
			return;
		}

		selectHighlightedOption();

		// For single selects, hide the options when once is clicked
		if(!isMultiple(active_select)) {
			hideOptions();
		}
		// Multiple selects remain open
		else {
			renderOptions();
		}
	});

	// Clicking a select toggles the option list
	$document.on('click', 'swift-box', function(e) {
		if(this === active_select || isDisabled(this)) {
			hideOptions();
		}
		else {
			showOptions(this);
		}
	});

	$document.on('focusin', 'swift-box', function() {
		if(this !== active_select) {
			addFocusClass(this);
		}
	});

	$document.on('focusout', 'swift-box', function() {
		if(this !== active_select) {
			removeFocusClass(this);
		}
	});

	// Prevent default behavior when clicking on an anchor tag within the select
	$document.on('click', 'swift-box a', function(e) {
		e.preventDefault();
	});

	// Pressing down arrow or letter keys shows the option list
	$document.on('keydown keypress', 'swift-box', function(e) {
		if(this === active_select || isDisabled(this)) {
			return;
		}

		var which = e.which;
		var show  = false;

		if(e.type === 'keypress') {
			show = which >= 32;
		}
		else {
			show = which === 40;

			// Because we use an <a> tag to allow tabbing into the select, we need
			// to prevent the enter key from triggering a "click" event on it
			if(which === 13) {
				e.preventDefault();

				// If we are not showing the options, submit the parent form
				if(!show) {
					$(this).closest('form').trigger('submit');
				}
			}
		}

		if(show) {
			showOptions(this);
			e.preventDefault();

			if(e.type === 'keypress') {
				var character = String.fromCharCode(which);
				$option_input.val(character);
			}
		}
	});

	// Arrow keys maneuver through the option list
	$option_input.on('keydown', function(e) {
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
			highlightOption(index);

			// Prevent the text cursor from jumping to home/end
			e.preventDefault();
		}
	});

	// Tab/Enter selects the highlighted option
	$document.on('keydown', function(e) {
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
			if(!isMultiple(active_select)) {
				selectHighlightedOption();
				hideOptions();
			}
			// In multiple mode
			else {
				// Only the enter key selects options
				if(keyCode === 13) {
					selectHighlightedOption();
					renderOptions();
				}
				// The tab key hides options and moves to the next field
				else {
					hideOptions();
					focus(active_select);
				}
			}
		}
	});

	// Escape hides the options
	$document.on('keydown', function(e) {
		var keyCode = e.which;

		if(active_select && keyCode === 27) {
			hideOptions();
		}
	});

	// Clicking anywhere in the document hides the options
	$document.on('mousedown', function(e) {
		if(!active_select) {
			return;
		}

		// Make sure the target of the click is not within the option list
		if(!$(e.target).closest('swift-box, swift-box-options').length) {
			hideOptions();
		}
		else {
			$option_input.focus();
		}
	});

	// Shim label behavior
	$document.on('click', 'label', function() {
		var for_target = this.for;
		var element;

		// Get the element the label is linked to
		if(for_target) {
			element = document.getElementById(for_target);
		}
		else {
			element = this.querySelector('swift-box');
		}

		if(element && element !== active_select && element.tagName === 'SWIFT-BOX') {
			$(element).trigger('click');
		}
	});

	// Scrolling or resizing the window repositions the option list
	$window.on('scroll resize', function() {
		if(!active_select) {
			return;
		}

		positionOptions();
	});

	// =========================================================================
	// Initiliazation
	// =========================================================================

	/**
	 * Converts select elements into SwiftBoxes
	 * @return {Array} An array of SwiftBoxes
	 */
	function SwiftBox(elements, config) {
		elements = normalizeElementArray(elements);

		var new_elements = [];

		for(var i = 0; i < elements.length; ++i) {
			var element = elements[i];

			var tag = element.tagName.toLowerCase();

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
			var parent_node = element.parentNode;
			if(parent_node) {
				parent_node.insertBefore(new_element, element);
				parent_node.removeChild(element);
			}

			// Extract existing options
			var option_array = extractOptionArrayFromSelect(element);
			setOptionArray(new_element, option_array, null);

			// Set the selected index
			setSelectedIndexes(new_element, element.selectedIndex);

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
			config = $.extend(true, {}, defaults, config);
			setConfig(config_elements, config);
		}

		return new_elements;
	}

	// =========================================================================
	// Config Option Manipulation
	// =========================================================================

	var defaults = {
		filter_function: defaultFilterFunction
	};

	/**
	 * Merges a set of config options and makes them part of the default
	 * @param {Object} config A config object
	 */
	function setDefaultConfig(config) {
		$.extend(true, defaults, config);
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
			var new_config      = $.extend(true, {}, defaults, existing_config, config);

			config_objects.push(new_config);
			element.setAttribute('data-swift-box-config', index);
		}
	}

	/**
	 * Gets the configuration object on a select
	 * @param {Array}  elements The SwiftBox elements
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

	/**
	 * Determines if a select is a multi-select
	 * @param  {Object}  element The SwiftBox element
	 * @return {Boolean}
	 */
	function isMultiple(element) {
		element = normalizeElementArray(element)[0];

		return element && element.hasAttribute('multiple');
	}

	/**
	 * Determines if a select is disabled
	 * @param  {Object}  element The SwiftBox element
	 * @return {Boolean}
	 */
	function isDisabled(element) {
		element = normalizeElementArray(element)[0];

		return element && element.hasAttribute('disabled');
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
	 * the first method may break the sort_function argument is null
	 *
	 * @param {Array}   elements          The SwiftBox elements
	 * @param {Array}   option_array      The options to set
	 * @param {Array}   sort_function     A sort function to run on the options. Passing undefined or true will sort the options by text. Passing null will maintain the existing order.
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

		// Get the width based on the options
		var option_width = calculateWidth(elements, normalized_option_array.array);

		for(var i = 0; i < elements.length; ++i) {
			var element = elements[i];

			// Get any existing values
			var values = getValues(element);

			// Get any attempted values
			var attempted_values = element.getAttribute('data-swift-box-attempted-values');

			// Store the index of the option array on the element
			element.setAttribute('data-swift-box-options', option_array_index);

			// If values were found, set them
			if(values.length) {
				setValues(element, values);
			}
			// If we previously tried to set values without any options, try again
			else if(attempted_values) {
				attempted_values = JSON.parse(attempted_values);
				setValues(element, attempted_values);
			}
			// Otherwise, single selects default to the first option
			else if(!isMultiple(element)) {
				setSelectedIndexes(element, 0);
			}

			// Set the width of the element to match the options
			element.style.width = option_width + 'px';
		}
	}

	/**
	 * Add options to a select
	 * @param {Array}   elements          The SwiftBox elements
	 * @param {Array}   option_array      The options to add
	 * @param {Array}   sort_function     A sort function to run on the options. Passing undefined or true will sort the options by text. Passing null will maintain the existing order.
	 * @param {Boolean} remove_duplicates Set to true to remove duplicate values
	 */
	function addOptionArray(elements, option_array, sort_function, remove_duplicates) {
		elements = normalizeElementArray(elements);

		var normalized_option_array = normalizeOptionArray(option_array);

		for(var i = 0; i < elements.length; ++i) {
			var element               = elements[i];
			var existing_option_array = getOptionArray(element) || [];
			var new_option_array      = existing_option_array.concat(normalized_option_array.array);

			setOptionArray(element, new_option_array, remove_duplicates);
		}
	}

	/**
	 * Removes a list of values from a select's options
	 * @param {Array} elements    The SwiftBox elements
	 * @param {Array} value_array An array of values to remove
	 */
	function removeOptionArray(elements, value_array) {
		elements = normalizeElementArray(elements);

		if(!(value_array instanceof Array)) {
			throw new Error('Invalid value array: ' + value_array);
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

			setOptionArray(element, new_option_array);
		}
	}

	/**
	 * Converts an array of options into an optimized array for internal use
	 * @param  {Array}   option_array      The options to add
	 * @param  {Array}   sort_function     A sort function to run on the options. Passing undefined or true will sort the options by text. Passing null will maintain the existing order.
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
		var is_array = option_array instanceof Array;
		var index    = 0;

		for(var key in option_array) {
			if(!option_array.hasOwnProperty(key)) {
				continue;
			}

			var option = option_array[key];
			var value;
			var text;

			if(is_array) {
				value = option.value;
				text  = option.text;
			}
			else {
				value = key;
				text  = option;
			}

			if(value === undefined || value === null) {
				throw new Error('No value defined for option at index ' + key);
			}

			if(text === undefined || text === null) {
				throw new Error('No text defined for option at index ' + key);
			}

			// Normalize value and text
			value = value + '';
			text  = $.trim((text + '').replace(tag_regexp + '', ''));

			var new_option = {
				index          : index,
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
		if(sort_function !== null) {
			// If undefined or true is passed in as the sort function, use the default sort
			if(sort_function === undefined || sort_function === true) {
				sort_function = defaultSortFunction;
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
	 * Extracts options from a traditional <select>
	 * @param  {Object} select The select
	 * @return {Array}         An array of options
	 */
	function extractOptionArrayFromSelect(select) {
		var options = select.options;

		var result = [];
		for(var i = 0; i < options.length; ++i) {
			var option = options[i];

			result.push({
				value: option.value,
				text: option.text
			});
		}

		return result;
	}

	/**
	 * Gets the option array on a select
	 * @param  {Object} element The SwiftBox element
	 * @return {Array}
	 */
	function getOptionArray(element) {
		element   = normalizeElementArray(element)[0];
		var index = element && element.getAttribute('data-swift-box-options');

		return option_arrays[index];
	}

	/**
	 * Shows the list of options for a select
	 * @param {Object} element The SwiftBox element
	 */
	function showOptions(element) {
		element = normalizeElementArray(element)[0];

		// Ensure the option container is within the body
		// This is done here because the body element may not have existed previously
		var main_element = document.body || document.documentElement;
		if(swiftbox_options.parentNode !== main_element) {
			main_element.appendChild(swiftbox_options);
		}

		// Remove the focus class on the currently active select
		if(active_select) {
			removeFocusClass(active_select);
		}

		// Store this select as the currently active select
		active_select = element;

		// Clear the filter input
		$option_input.val('').attr('data-last-text', '');

		// Add the focus class to the select for styling
		addFocusClass(element);

		// Toggle the multiple class if the current select allows multiple values
		$option_container.toggleClass('multiple', isMultiple(element));

		// Show the option list
		$option_container.removeClass('swift-box-hidden');

		// Reset the filter
		filterOptions('');

		// Position the option list
		positionOptions();

		// Highlight the currently selected option
		var current_indexes = getSelectedIndexes(element);
		var highlight_index = current_indexes[0] || 0;
		highlightOption(highlight_index, true);

		// Focus on the filter input
		$option_input.focus();
	}

	/**
	 * Positions the option container appropriately close to the active select
	 */
	function positionOptions() {
		var $active_select = $(active_select);
		var width          = $active_select.outerWidth();
		var height         = $active_select.outerHeight();
		var offset         = $active_select.offset();
		var window_width   = $window.width();
		var window_height  = $window.height();

		var top_edge       = offset.top + height;
		var left_edge      = offset.left;
		var right_edge     = left_edge + $option_container.outerWidth();
		var bottom_edge    = top_edge + $option_container.outerHeight();

		var top            = top_edge;
		var right          = null;
		var bottom         = null;
		var left           = left_edge;

		// Save the current scroll position within the options
		var scroll_top  = $option_scroll.scrollTop();
		var scroll_left = $option_scroll.scrollLeft();

		// Prevent the list from going off the page
		if(bottom_edge >= window_height) {
			top    = null;
			bottom = window_height - offset.top;

			$option_container.addClass('bottom');
			$option_scroll.prependTo($option_container);
		}
		else {
			$option_container.removeClass('bottom');
			$option_scroll.appendTo($option_container);
		}

		if(right_edge >= window_width) {
			right = 0;
		}

		if(left <= 0) {
			left = 0;
		}

		// Position the option list
		$option_container
			.css({
				top    : top === null ? 'auto' : top + 'px',
				right  : right === null ? 'auto' : right + 'px',
				bottom : bottom === null ? 'auto' : bottom + 'px',
				left   : left === null ? 'auto' : left + 'px'
			});

		// Restore the scroll position
		$option_scroll.scrollTop(scroll_top);
		$option_scroll.scrollLeft(scroll_left);

		// Focus on the filter input
		$option_input.focus();

		// Render the options
		renderOptions();
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
		$option_scroll.toggleClass('empty', !filtered_option_array.length);

		// Get some dimensions
		var option_height        = getOptionHeight();
		var container_max_height = option_height * max_visible_options;
		var sizer_width          = Math.max(calculateWidth(active_select, option_array), $(active_select).outerWidth());
		var sizer_height         = option_height * filtered_option_array.length;

		$option_scroll
			.scrollTop(0)
			.scrollLeft(0)
			.css({
				width     : sizer_width - 2 + 'px',
				maxHeight : container_max_height + 'px'
			});

		$option_sizer.css({
			height: sizer_height + 'px'
		});

		// Highlight the first match
		highlightOption(0, true);
	}

	/**
	 * Renders the options for a select, calculating which options to show
	 * based on the scroll position
	 * @param  {Number} scroll_top The scroll position of the options
	 */
	function renderOptions(scroll_top) {
		// Hide all options initially
		$option_elements.addClass('swift-box-hidden');

		// If there are no options, we're done
		if(!filtered_option_array.length) {
			return;
		}

		// If no scroll position was passed in, use the current position
		if(scroll_top === undefined) {
			scroll_top = $option_scroll.scrollTop();
		}
		// Otherwise set the scroll position on the element
		else {
			$option_scroll.scrollTop(scroll_top);
		}

		// Store the height of a single option
		var option_height = getOptionHeight();

		// Get the currently selected indexes
		var current_indexes = getSelectedIndexes(active_select);

		// Calculate the position of the visible options within the scrollable area
		var top = scroll_top - (scroll_top % option_height);

		// Calculate which options to show based on the scroll position
		var offset = Math.floor(scroll_top / option_height);
		var limit  = Math.min(max_visible_options + 1, filtered_option_array.length - offset);

		// Detach the option list for performance
		$option_list
			.detach()
			.css({
				top: top + 'px'
			});

		// For each visible option
		for(var i = 0; i < limit; ++i) {
			var filtered_index = i + offset;
			var option         = filtered_option_array[filtered_index];
			var option_index   = option.index;

			$option_elements.eq(i)
				.attr('data-index', option_index)
				.attr('data-filtered-index', filtered_index)
				.removeClass('swift-box-hidden')
				.toggleClass('highlight', filtered_index === highlighted_option_index)
				.toggleClass('selected', indexOf(current_indexes, option_index) !== -1)
					.find('.text')
					.html(option.highlight_text);
		}

		$option_scroll.append($option_list);
	}

	/**
	 * Hides the option list
	 */
	function hideOptions() {
		// Hide the option list
		$option_container.addClass('swift-box-hidden');

		if(active_select) {
			// Remove the focus class from the select
			removeFocusClass(active_select);

			// Focus on the select, blurring the filter input
			focus(active_select);

			// Clear the active select
			active_select = null;
		}
	}

	/**
	 * Highlights an option in the option list, scrolling to it if needed
	 * @param  {Number}  index The option index to highlight
	 * @param  {Boolean} top   Set to true to scroll to where the option is at the top of the list
	 */
	function highlightOption(index, top) {
		var scroll_height = $option_scroll.height();
		var option_height = getOptionHeight();

		index = +index || 0;
		index = Math.max(index, 0);
		index = Math.min(index, filtered_option_array.length -1);

		var scroll_top = $option_scroll.scrollTop();
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

		var index       = option.index;
		var new_indexes = index;

		// Multiple selects need to toggle the selected option based on if it
		// already exists within the selected options or not
		if(isMultiple(active_select)) {
			var new_indexes = getSelectedIndexes(active_select);
			var exists = indexOf(new_indexes, index);

			// If the option isn't selected, select it
			if(exists === -1) {
				new_indexes.push(index);
			}
			// Otherwise, deselect it
			else {
				new_indexes.splice(exists, 1);
			}
		}

		// Set the new selected indexes
		setSelectedIndexes(active_select, new_indexes, true);
	}

	/**
	 * Calculates the height of a single option
	 * Additionally, this forces the all options to have the same height to account for rounding by the browser
	 * @return {[type]} [description]
	 */
	function getOptionHeight() {
		// Reset the height on the elements
		$option_elements.css({
			height     : '',
			lineHeight : ''
		});

		// Get the height of the first element
		var height = Math.round($option_elements.outerHeight());

		$option_elements.css({
			height     : height + 'px',
			lineHeight : height + 'px'
		});

		return height;
	}

	/**
	 * Gets the option value map for a select
	 * @param  {Object}      element The SwiftBox element
	 * @return {Object|null}         The value map or null if no options are set
	 */
	function getOptionValueMap(element) {
		element   = normalizeElementArray(element)[0];
		var index = element && element.getAttribute('data-swift-box-options');

		return option_array_value_maps[index];
	}

	/**
	 * Calculates the width of the select based on widest option.
	 * In older browsers that don't support canvas, the width is
	 * approximated, possibly failing miserably.
	 * @param  {Object} element      The SwiftBox element
	 * @param  {Array}  option_array The array of options
	 * @return {Number}              The width of the widest option
	 */
	function calculateWidth(element, option_array) {
		element      = normalizeElementArray(element)[0];
		option_array = option_array || [];

		var $element    = $(element);
		var font_size   = $element.css('font-size');
		var font_family = $element.css('font-family');

		// Set the font on the canvas
		if(supports.canvas) {
			canvas_context.font = font_size + ' ' + font_family;
		}

		var max_width = 0;

		for(var i = 0; i < option_array.length; ++i) {
			var option = option_array[i];
			var width;

			// In modern browsers, we can accurately measure the text using the canvas
			if(supports.canvas) {
				width = canvas_context.measureText(option.text).width;
			}
			// In older browsers, use the text length
			else {
				width = option.text.length;
			}

			max_width = Math.max(width, max_width);
		}

		// In older browsers, estimate based on the text length
		if(!supports.canvas) {
			max_width = Math.max(max_width, 8) * .75 * parseFloat(font_size);
		}

		// Add the button's width
		max_width += $(getElementCache(element).button).outerWidth();

		// Add some extra pixels to account for padding
		max_width += 10;

		return max_width;
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

				if(option.value !== existing_option.value || option.text !== existing_option.text) {
					continue option_array_loop;
				}
			}

			return i;
		}

		return -1;
	}

	function defaultSortFunction(a, b) {
		if(a.text !== b.text) {
			// Empty values should appear at the top
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
	function defaultFilterFunction(needle, haystacks) {
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


	// =========================================================================
	// Value Manipulation
	// =========================================================================

	/**
	 * Gets all selected values of a select
	 * @param  {Object} element The SwiftBox element
	 * @return {Array}
	 */
	function getValues(element) {
		element             = normalizeElementArray(element)[0];
		var current_indexes = getSelectedIndexes(element);
		var option_array    = getOptionArray(element);
		var values          = [];

		if(!option_array) {
			return [];
		}

		for(var i = 0; i < current_indexes.length; ++i) {
			var index  = current_indexes[i];
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

			// If there are no options, store the attempted values so we can try
			// to set them in the future when options are defined
			var attempted_values = '';
			if(!option_value_map && clean_values.length) {
				attempted_values = JSON.stringify(clean_values);
			}
			element.setAttribute('data-swift-box-attempted-values', attempted_values);

			if(option_value_map) {
				for(var j = 0; j < clean_values.length; ++j) {
					var value = clean_values[j];
					var index = option_value_map[value];

					if(index !== undefined) {
						indexes.push(index);
					}
				}

				setSelectedIndexes(element, indexes, trigger_change);
			}
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

		var changed_elements = [];

		for(var i = 0; i < elements.length; ++i) {
			var element         = elements[i];
			var current_indexes = getSelectedIndexes(element);
			var option_array    = getOptionArray(element);
			var new_indexes     = [];

			if(option_array) {
				for(var j = 0; j < indexes.length; ++j) {
					var index = +indexes[j];

					if(isNaN(index)) {
						continue;
					}

					var option = option_array[index];
					var valid  = !!option;

					if(valid) {
						new_indexes.push(index);
					}
				}

				new_indexes.sort();
			}

			// Set the new indexes
			element.setAttribute('data-swift-box-indexes', new_indexes.join(','));

			var text = [];
			for(var j = 0; j < new_indexes.length; ++j) {
				var index  = new_indexes[j];
				var option = option_array[index];

				if(option) {
					text.push(option.text);
				}
			}

			setText(element, text.join(', '));

			// Update the hidden inputs to contain the new values
			var values = getValues(element);
			var name   = element.getAttribute('data-swift-box-name');

			// Get the hidden input container
			var input_container = element.querySelector('.swift-box-hidden-input-container');

			// Clear the existing hidden inputs inside the container
			var first_child;
			while(first_child = input_container.firstChild) {
				input_container.removeChild(first_child);
			}

			// Make sure there is at least one hidden input
			var input_count = values.length || 1;

			// Create a hidden input for each value
			for(var j = 0; j < input_count; ++j) {
				var input   = hidden_input.cloneNode(true);
				input.name  = name;
				input.value = values[j];

				input_container.appendChild(input);
			}

			// Trigger a change if the indexes have changed
			if(trigger_change) {
				for(var j = 0; j < new_indexes.length; ++j) {
					if(new_indexes[j] !== current_indexes[j]) {
						changed_elements.push(element);
						break;
					}
				}
			}
		}

		// Trigger any change events
		if(changed_elements.length) {
			$(changed_elements).trigger('change');
		}
	}

	/**
	 * Gets the display text of a select
	 * @param  {Object} element The SwiftBox element
	 * @return {String}
	 */
	function getText(element) {
		var text_element = getElementCache(element).text;

		if(text_element) {
			return text_element[textContent];
		}

		return '';
	}

	/**
	 * Sets the display text of a select
	 * @param {Object} elements The SwiftBox elements
	 * @param {String} text     The text to set
	 */
	function setText(elements, text) {
		elements = normalizeElementArray(elements);

		// Normalize the text
		if(text === undefined || text === null) {
			text = '';
		}
		text += '';

		for(var i = 0; i < elements.length; ++i) {
			var text_element = getElementCache(elements[i]).text;

			if(text_element) {
				text_element[textContent] = text;
			}
		}
	}

	/**
	 * Focuses a select
	 * @param {Object} element The SwiftBox element
	 */
	function focus(element) {
		var container_element = getElementCache(element).container;

		if(container_element) {
			container_element.focus();
		}
	}

	/**
	 * Blurs a select
	 * @param {Object} element The SwiftBox element
	 */
	function blur(element) {
		var container_element = getElementCache(element).container;

		if(container_element) {
			container_element.blur();
		}
	}

	/**
	 * Marks a select as focused
	 * @param {Object} element The SwiftBox element
	 */
	function addFocusClass(element) {
		var $element = $(element);

		$element.addClass('focus');
		$(getElementCache(element).container).addClass('focus');
	}

	/**
	 * Unmarks a select as focused
	 * @param {Object} element The SwiftBox element
	 */
	function removeFocusClass(element) {
		var $element = $(element);

		$element.removeClass('focus');
		$(getElementCache(element).container).removeClass('focus');
	}

	// =========================================================================
	// Shadow Root Manipulation
	// =========================================================================

	/**
	 * Creates a shadow root using a template
	 * @param  {Object} element  The SwiftBox element
	 * @param  {Object} template An element to be used as a template
	 */
	function createShadowRoot(element, template) {
		var root;

		if(supports.components) {
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

	// =========================================================================
	// Expose methods
	// =========================================================================
	window.SwiftBox = SwiftBox;

	SwiftBox.setDefaultConfig = setDefaultConfig;

	SwiftBox.config = function(elements, option, value) {
		if(arguments.length <= 1) {
			return $.extend(true, {}, getConfig(elements));
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
			var config_object = {}
			config_object[option] = value;

			setConfig(elements, config_object);
		}

		return elements;
	};

	SwiftBox.options = function(elements) {
		if(arguments.length <= 1) {
			return $.extend(true, [], getOptionArray(elements));
		}

		setOptionArray.apply(null, arguments);
		return elements;
	};

	SwiftBox.addOptions = function(elements) {
		addOptionArray.apply(null, arguments);

		return elements;
	};

	SwiftBox.removeOptions = function(elements) {
		removeOptionArray.apply(null, arguments);

		return elements;
	};

	SwiftBox.showOptions = function(elements) {
		showOptions.apply(null, arguments);

		return elements;
	};

	SwiftBox.filterOptions = function(elements) {
		filterOptions.apply(null, arguments);

		return elements;
	};

	SwiftBox.hideOptions = function(elements) {
		hideOptions.apply(null, arguments);

		return elements;
	};

	SwiftBox.value = function(elements) {
		if(arguments.length <= 1) {
			var values = getValues(elements);

			// For single selects, convert the value array to a single value
			if(!isMultiple(elements)) {
				values = values[0] || "";
			}

			return values;
		}

		setValues.apply(null, arguments);
		return elements;
	};

	SwiftBox.hasValue = function(elements) {
		return hasValue.apply(null, arguments);
	};

	SwiftBox.selectedIndex = function(elements) {
		if(arguments.length <= 1) {
			var current_indexes = getSelectedIndexes(elements);

			if(!isMultiple(elements)) {
				current_indexes = current_indexes[0];

				if(current_indexes === undefined) {
					current_indexes = -1;
				}
			}

			return current_indexes;
		}

		setSelectedIndexes.apply(null, arguments);
		return elements;
	};

	SwiftBox.text = function(elements) {
		if(arguments.length <= 1) {
			return getText(elements);
		}

		setText.apply(null, arguments);
		return elements;
	};

	SwiftBox.focus = function(elements) {
		focus.apply(null, arguments);

		return elements;
	};

	SwiftBox.blur = function(elements) {
		blur.apply(null, arguments);

		return elements;
	};

	/**
	 * jQuery plugin function
	 * @return {Object} The jQuery collection the function was called on
	 */
	$.fn.swiftbox = function() {
		var args = Array.prototype.slice.call(arguments, 0);

		// Initialize if the first argument is undefined or an object
		if(args[0] === undefined || typeof args[0] === 'object') {
			args.unshift(this);

			return $(SwiftBox.apply(null, args));
		}

		// Determine the method to be called
		var method = args.shift();

		if(typeof SwiftBox[method] !== 'function') {
			throw new Error('Invalid SwiftBox method: ' + method);
		}

		// Add the elements as the first argument
		args.unshift($(SwiftBox(this)));

		// Call the method
		return SwiftBox[method].apply(null, args);
	};

	// Extend the :input pseudo-selector
	var jquery_input_selector = $.expr[':'].input;

	$.expr[':'].input = function(element) {
		var $element = $(element);

		// If the element matches the original :input selector
		if(jquery_input_selector(element)) {
			// Make sure the element is not contained within the SwiftBox
			return !$element.closest('swift-box').length;
		}

		return $element.is('swift-box');
	};

	// Map properties to specific jQuery functions
	var jquery_functions = {
		value : $.fn.val,
		text  : $.fn.text
	}

	// Extend the $.val method
	$.fn.val = function() {
		return prop.call(this, 'value', arguments);
	};

	// Extend the $.val method
	$.fn.text = function() {
		return prop.call(this, 'text', arguments);
	};

	function prop(property, args) {
		var jquery_function = jquery_functions[property];

		// If no arguments are passed in, act only on the first element
		if(!args.length) {
			var $first = this.first();

			// Get the value for swift-boxes
			if($first.is('swift-box')) {
				return $first.swiftbox(property);
			}

			// Get the value for all other elements
			return jquery_function.call($first);
		}

		// Set the property for normal elements
		var $other_elements = this.not('swift-box');
		if($other_elements.length) {
			jquery_function.apply($other_elements, args);
		}

		// Set the property via the plugin
		var $swiftboxes = this.filter('swift-box');
		if($swiftboxes.length) {
			// Add the property as the first argument to pass to the plugin
			var plugin_args = Array.prototype.slice.call(args, 0);
			plugin_args.unshift(property);

			$.fn.swiftbox.apply($swiftboxes, plugin_args);
		}

		return this;
	}
}(jQuery, window));
