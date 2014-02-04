(function($, window, undefined) {
	'use strict';

	// =========================================================================
	// Browser Normalization
	// =========================================================================

	var document = window.document;

	// Feature support detection
	var test_template = document.createElement('template');
	var test_canvas   = document.createElement('canvas');

	var supports = {
		components   : false, //!!document.register,
		templates    : !!test_template.content,
		canvas       : !!test_canvas.getContext
	};

	// Determine what element to use for templating (IE compatibility)
	var template_element = supports.templates ? 'template' : 'div';

	// Get the context of the canvas if supported
	var canvas_context = supports.canvas ? test_canvas.getContext('2d') : null;

	// Get the CSS url
	var style_href = window.swift_select_style_href;
	if(!style_href) {
		var script_src = $('script').last().prop('src');
		style_href = script_src.slice(0, -3) + '.css';
	}

	// Determine how the CSS will be loaded
	var global_style_import    = supports.components ? '' : '<link rel="stylesheet" href="' + style_href + '">';
	var component_style_import = supports.components ? '<style>@import url(' + style_href + ');</style>' : '';

	// Append the global style if needed
	$(document.documentElement).append(global_style_import);

	// Array.indexOf for IE8
	function indexOf(array, value) {
		if(Array.prototype.indexOf) {
			return Array.prototype.indexOf.call(array, value);
		}

		for(var i = 0; i < array; ++i) {
			var test_value = array[i];
			if(value === test_value) {
				return i;
			}
		}

		return -1;
	}

	// =========================================================================
	// Variables
	// =========================================================================

	// The name of the select tag
	var tag_name = 'swift-select';

	// The name of the select options tag
	var options_tag_name = 'swift-select-options';

	// The name of the template class
	var template_class_name = 'swift-select-template';

	// Stores the option arrays
	var option_arrays = [];

	// Stores a map between value and index for each option array
	var option_array_value_maps = [];

	// Stores config objects
	var config_objects = [];

	// Stores the currently active select
	var $active_select = null;

	// Stores the current list of filtered options
	var filtered_options = [];

	// Stores the currently highlighted option's index
	var highlighted_option_index = null;

	// The maximum number of visible options
	var max_visible_options = 15;

	// Element height restriction
	// Browsers have a hard limit on the maximum height of any one element. This
	// serves as a lowest common denominator
	var height_restriction = 1000000;

	// RegExp used to escape RegExp special characters
	var escape_regex = /([-[\]{}()*+?.,\\^$|#\s])/g;

	// RegExp used to remove tags from option text
	var tag_regexp = /<[^>]+>/g;

	// =========================================================================
	// Custom Tags
	// =========================================================================

	// Register the tags as components if supported
	if(supports.components) {
		document.register(tag_name, {
			prototype: Object.create(HTMLDivElement.prototype)
		});

		document.register(options_tag_name, {
			prototype: Object.create(HTMLDivElement.prototype)
		});
	}
	// Otherwise, create the tags for styling compatibilty
	else {
		document.createElement(tag_name);
		document.createElement(options_tag_name);
	}

	// =========================================================================
	// Templates
	// =========================================================================

	var input_html = [
		'<' + template_element + ' class="' + template_class_name + '">',
			component_style_import,
			'<div class="swift-select">',
				'<a href="#" class="container">',
					'<div class="text"></div>',
					'<div class="button">▼</div>',
				'</a>',
			'</div>',
		'</' + template_element + '>'
	].join('');

	var options_html = [
		'<' + template_element + ' class="' + template_class_name + '">',
			component_style_import,
			'<div class="swift-select-options">',
				'<div class="container hidden">',
					'<div class="input-container">',
						'<input class="input" tabindex="-1" placeholder="Filter">',
						'<div class="helpers">',
							'<div class="all helper">Check all visible</div>',
							'<div class="clear helper">Clear</div>',
						'</div>',
					'</div>',

					'<div class="scroll">',
						'<div class="sizer">',
							'<div class="list">',
								Array(max_visible_options + 2).join(
									[
										'<div class="option">',
											'<span class="state"></span>',
											'<span class="text"></span>',
										'</div>'
									].join('')
								),
							'</div>',
						'</div>',

						'<div class="none">No Options Found</div>',
					'</div>',
				'</div>',
			'</div>',
		'</' + template_element + '>'
	].join('');

	// Convert the templates to elements and append them to the document
	var $input_template   = $(input_html).appendTo(document.documentElement);
	var $options_template = $(options_html).appendTo(document.documentElement);

	// Get the DOM from the template
	if(supports.templates) {
		var $input_dom   = $($input_template.prop('content'));
		var $options_dom = $($options_template.prop('content'));
	}
	else {
		var $input_dom   = $input_template.children();
		var $options_dom = $options_template.children();
	}

	// =========================================================================
	// Option List
	// =========================================================================

	// Create the option list
	var $options = $(document.createElement(options_tag_name));
	$options.appendTo(document.documentElement);

	// Create the shadow root for the option list
	createShadowRoot.call($options, $options_dom);

	// Store some references to important option list elements
	var $option_container = findInShadowRoot.call($options, '.container');
	var $option_input     = findInShadowRoot.call($options, '.input');
	var $option_all       = findInShadowRoot.call($options, '.all');
	var $option_clear     = findInShadowRoot.call($options, '.clear');
	var $option_scroll    = findInShadowRoot.call($options, '.scroll');
	var $option_sizer     = findInShadowRoot.call($options, '.sizer');
	var $option_list      = findInShadowRoot.call($options, '.list');
	var $option_elements  = findInShadowRoot.call($options, '.option');

	// =========================================================================
	// Event Handlers
	// =========================================================================

	// Clicking the option list refocuses the filter input
	$option_container.on('mouseup', function() {
		$option_input.focus();
	});

	// Typing within the filter input filters the options
	$option_input.on('keyup', function(e) {
		var $this      = $(this);
		var value      = $this.val();
		var last_value = $this.data('last-text');

		if(value !== last_value) {
			filterOptions.call($active_select, value, true);

			$this.data('last-text', value);
		}
	});

	// Click the check all button selects all options on multi-selects
	$option_all.on('click', function() {
		var selected_indexes = getSelectedIndexes.call($active_select);
		var new_indexes      = [];
		var index_map        = {};

		for(var i = 0; i < selected_indexes.length; ++i) {
			var index = selected_indexes[i];

			index_map[index] = true;
		}

		for(var i = 0; i < filtered_options.length; ++i) {
			var filtered_option = filtered_options[i];
			var index           = filtered_option.index;

			index_map[index] = true;
		}

		for(var index in index_map) {
			new_indexes.push(index);
		}

		setSelectedIndexes.call($active_select, new_indexes);
		$option_input.focus();
		renderOptions();
	});

	// Clicking the clear button clears the select value
	$option_clear.on('click', function() {
		setSelectedIndexes.call($active_select, []);
		$option_input.focus();
		renderOptions();
	});

	// Scrolling renders the options
	$option_scroll.on('scroll', function() {
		renderOptions();
	});

	// Hovering over an option highlights it
	$option_list.on('mouseenter', '.option', function() {
		var filtered_index = $(this).data('filtered-index');
		highlightOption(filtered_index);
	});

	// Clicking an option selects it
	$option_list.on('mouseup', '.option', function(e) {
		if(e.which !== 1) {
			return;
		}

		selectHighlightedOption();

		// For single selects, hide the options when once is clicked
		if(!isMultiple.call($active_select)) {
			hideOptions();
		}
		// Multiple selects remain open
		else {
			renderOptions();
		}
	});

	// Clicking a select toggles the option list
	$(document).on('click', tag_name, function(e) {
		// If this select is already displaying its options, close it
		if($(this).is($active_select)) {
			hideOptions();
		}
		else {
			showOptions.call(this);
		}

		e.preventDefault();
	});

	// The down arrow shows the options
	$(document).on('keydown', tag_name, function(e) {
		if($(this).is($active_select)) {
			return;
		}

		var keyCode = e.which;

		if(keyCode === 40) {
			showOptions.call(this);
			e.preventDefault();
		}
	});

	// Arrow keys show and maneuver through the options
	$option_input.on('keydown', function(e) {
		if(!$active_select) {
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
	$(document).on('keydown', function(e) {
		if(!$active_select) {
			return;
		}

		var keyCode = e.which;

		if(keyCode === 9 || keyCode === 13) {
			// Prevent form submissions
			if(keyCode === 13) {
				e.preventDefault();
			}

			// In singular mode, tab or enter selectes the current option and hides the options
			if(!isMultiple.call($active_select)) {
				selectHighlightedOption();
				hideOptions();
			}
			// In multiple mode, only the enter key selects options
			else if(keyCode === 13) {
				selectHighlightedOption();
				renderOptions();
			}
			// In multiple mode, the tab key hides options and moves to the next field
			else {
				hideOptions();
				focus.call($active_select);
			}
		}
	});

	// Escape hides the options
	$(document).on('keydown', function(e) {
		var keyCode = e.which;

		if($active_select && keyCode === 27) {
			hideOptions();
		}
	});

	// Clicking anywhere in the document hides the options
	$(document).on('mousedown', function(e) {
		// Make sure the target of the close is not within the option list
		if(!$(e.target).closest(tag_name + ', ' + options_tag_name).length) {
			hideOptions();
		}
		else {
			$option_input.focus();
		}
	});

	// =========================================================================
	// Initiliazation
	// =========================================================================

	/**
	 * Initializes select elements
	 * @return {Object} A jQuery object containing the initialized elements
	 */
	function initialize(config) {
		var $elements = $(this).map(function() {
			var $this = $(this);

			var tag = $this.prop('tagName').toLowerCase();

			// If the element is already initialized, we're done
			if(tag === tag_name) {
				return this;
			}

			// Make sure the element is a select
			if(tag !== 'select') {
				throw new Error('Invalid element "' + tag + '". Expected "select"');
			}

			// Create the new element
			var $new_element = $(document.createElement(tag_name));

			// Add a hidden input so values are sent in normal form submissions
			var $hidden_input = $('<input>')
									.prop('type', 'hidden')
									.prop('name', $this.prop('name'))
									.addClass('hidden-input')
									.appendTo($new_element);

			// Append the select template to the new element
			createShadowRoot.call($new_element, $input_dom);

			// Copy all attributes from the select to the new element
			var attributes = this.attributes;
			for(var i = 0; i < attributes.length; ++i) {
				var attribute = attributes[i];

				// Classes need to be appended to the new element
				if(attribute.name === 'class') {
					$new_element.addClass(attribute.value);
				}
				// All other attributes except name are directly copied
				else if(attribute.name !== 'name') {
					$new_element.attr(attribute.name, attribute.value);
				}
			}

			// Replace the old element
			$this.replaceWith($new_element);

			// Extract existing options
			var options = extractOptionArray.call(this);
			setOptionArray.call($new_element, options);

			// Set the selected index
			setSelectedIndexes.call($new_element, $(this).prop('selectedIndex'));

			return $new_element.get(0);
		});

		// Set the configuration options on all elements passed in
		var $configure_elements = config ? $elements : $elements.not('[data-swift-select-config]');
		if($configure_elements.length) {
			config = $.extend({}, defaults, config);
			setConfigObject.call($configure_elements, config);
		}

		return $elements;
	}

	// =========================================================================
	// Config Option Manipulation
	// =========================================================================

	var defaults = {
		filter_function: defaultFilterFunction
	};

	/**
	 * Sets the configuration object on a select
	 * @param {Object} config The configuration object to set
	 */
	function setConfigObject(config) {
		var index = config_objects.push(config) - 1;

		return $(this).attr('data-swift-select-config', index);
	}

	/**
	 * Gets the configuration object on a select
	 * @param {Object} config The configuration object
	 */
	function getConfigObject() {
		var index = $(this).attr('data-swift-select-config');

		return config_objects[index];
	}

	/**
	 * Sets a single configuration option on a select
	 * @param {String} option The option to set
	 * @param {String} value  The value to set
	 */
	function setConfigOption(option, value) {
		return $(this).each(function() {
			var $this          = $(this);
			var config         = getConfigObject.call($this);
			var new_config     = $.extend({}, config);
			new_config[option] = value;

			setConfigObject.call($this, new_config);
		});
	}

	/**
	 * Gets a single configuration option on a select
	 * @param {String} option The option to get
	 */
	function getConfigOption(option) {
		var config = getConfigObject.call(this);

		return config[option];
	}

	/**
	 * Determines if a select is a multi-select
	 * @return {Boolean} Returns true if the select is a multi-select
	 */
	function isMultiple() {
		return $(this).attr('multiple') !== undefined
	}

	// =========================================================================
	// Option Array Manipulation
	// =========================================================================

	/**
	 * Sets the options on a select
	 * @param {Array} option_array An array of objects containing a "value" and "text" property
	 */
	function setOptionArray(option_array) {
		var $this = $(this);

		// Normalize the option array
		option_array = normalizeOptionArray(option_array);

		// Check if the option array already exists
		var index = findOptionArray(option_array);

		// Add the option_array if it does not exist
		if(index === -1) {
			var index = option_arrays.push(option_array) - 1;

			// Generate the map between values and indexes
			var option_value_map = generateOptionValueMap(option_array);
			option_array_value_maps.push(option_value_map);
		}

		// Store a reference to the option array
		$this.attr('data-swift-select-options', index);

		$this.each(function() {
			// Get any existing values
			var values = getValues.call(this);

			// If values were found, set them
			if(values.length) {
				setValues.call(this, values);
			}
			// Otherwise, single selects default to the first option
			else if(!isMultiple.call(this)) {
				setSelectedIndexes.call(this, 0);
			}
		});

		// Set the width based on the options
		var option_width = calculateWidth.call($this, option_array);
		$(this).css('width', option_width);

		return $this;
	}

	/**
	 * Gets the option array on a select
	 * @return {Array} The option array
	 */
	function getOptionArray() {
		var index = $(this).attr('data-swift-select-options');
		return option_arrays[index] || [];
	}

	/**
	 * Extracts options from a traditional <select>
	 * @return {Array} An array of options
	 */
	function extractOptionArray() {
		var $this = $(this);
		var options = $this.prop('options');

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
	 * Converts an array of options into an optimized array for internal use
	 * @param  {Array} option_array The array to normalize
	 * @return {Array}              The normalized array
	 */
	function normalizeOptionArray(option_array) {
		if(typeof option_array !== 'object') {
			throw new Error('Invalid option_array: ' + option_array);
		}

		var normalized_array = [];
		var is_array         = option_array instanceof Array;
		var index            = 0;

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
				text  = option + '';
			}

			if(value === undefined || value === null) {
				throw new Error('No value defined for option at index ' + key);
			}

			if(text === undefined || text === null) {
				throw new Error('No text defined for option at index ' + key);
			}

			// Normalize value and text
			value = value + '';
			text  = $.trim(text.replace(tag_regexp + '', ''));

			normalized_array.push({
				index          : index++,
				value          : value,
				text           : text,
				highlight_text : text
			});
		}

		return normalized_array;
	}

	/**
	 * Shows the list of options for a select
	 */
	function showOptions() {
		var $this = $(this).first();

		// Clear the filter input
		$option_input.val('').data('last-text', '');

		// Focus on the filter input. This needs to have a delay because in most cases,
		// the browser will focus on something else after this is called due to default behaviors
		setTimeout(function() {
			$option_input.focus();
		});

		// Store this select as the currently active select
		$active_select = $this;

		// Add the focus class to the select for styling
		getContainer.call($this).addClass('focus');

		// Toggle the multiple class if the current select allows multiple values
		// This is for styling multiple select options differently
		$option_container.toggleClass('multiple', isMultiple.call($this));

		// Get the position and dimensions of the select
		var width  = $this.outerWidth();
		var height = $this.outerHeight();
		var offset = $this.offset();
		offset.top += height + 2;
		offset.left -= 1;

		// Show the option list
		$option_container
			.removeClass('hidden')
			.css({
				top: offset.top + 'px',
				left: offset.left + 'px',
			});

		// Reset the filter
		filterOptions.call(this, '');

		// Highlight the currently selected option
		var current_indexes = getSelectedIndexes.call(this);
		var highlight_index = current_indexes[0] || 0;
		highlightOption(highlight_index, true);
	}

	/**
	 * Filters the list of options for a select
	 * @param  {String} filter_text The text to filter the options by
	 */
	function filterOptions(filter_text) {
		// Get the options for the active select
		var options = getOptionArray.call($active_select);

		// Filter the options
		filtered_options = filterOptionArray.call(this, options, filter_text);

		// Show the empty message if no options match the filter
		$option_scroll.toggleClass('empty', !filtered_options.length);

		// Get some dimensions
		var option_height        = $option_elements.outerHeight();
		var container_max_height = option_height * max_visible_options;
		var sizer_width          = calculateWidth.call($active_select, options);
		var sizer_min_width      = $active_select.outerWidth();
		var sizer_height         = Math.min(option_height * filtered_options.length, height_restriction);

		$option_scroll
			.scrollTop(0)
			.scrollLeft(0)
			.css({
				maxHeight: container_max_height + 'px'
			});

		$option_sizer.css({
			minWidth : sizer_min_width + 'px',
			width    : sizer_width,
			height   : sizer_height + 'px'
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
		$option_elements.addClass('hidden');

		// If there are no options, we're done
		if(!filtered_options.length) {
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
		var option_height = $option_elements.outerHeight();

		// Get the currently selected indexes
		var current_indexes = getSelectedIndexes.call($active_select);

		// Calculate the position of the visible options within the scrollable area
		var top = scroll_top - (scroll_top % option_height);

		// Calculate which options to show based on the scroll position
		var offset = Math.floor(scroll_top / option_height);
		var limit  = Math.min(max_visible_options + 1, filtered_options.length - offset);

		// Detach the option list for performance
		$option_list
			.detach()
			.css({
				top: top + 'px'
			});

		// For each visible option
		for(var i = 0; i < limit; ++i) {
			var filtered_index = i + offset;
			var option         = filtered_options[filtered_index];
			var option_index   = option.index;

			$option_elements.eq(i)
				.data('index', option_index)
				.data('filtered-index', filtered_index)
				.removeClass('hidden')
				.toggleClass('highlight', filtered_index === highlighted_option_index)
				.toggleClass('selected', indexOf(current_indexes, option_index) !== -1)
					.find('.text')
					.html(option.highlight_text);
		}

		$option_sizer.append($option_list);
	}

	/**
	 * Hides the option list
	 */
	function hideOptions() {
		// Hide the option list
		$option_container.addClass('hidden');

		// Remove the focus class from the select
		getContainer.call($active_select).removeClass('focus');

		// Focus on the select, blurring the filter input
		focus.call($active_select);

		// Clear the active select
		$active_select = null;
	}

	/**
	 * Highlights an option in the option list, scrolling to it if needed
	 * @param  {Number}  index The option index to highlight
	 * @param  {Boolean} top   Set to true to scroll to where the option is at the top of the list
	 */
	function highlightOption(index, top) {
		var container_height = $option_scroll.height();
		var option_height    = $option_elements.outerHeight();

		index = +index || 0;
		index = Math.max(index, 0);
		index = Math.min(index, filtered_options.length -1);

		var scroll_top = $option_scroll.scrollTop();
		var option_top = index * option_height;

		if(option_top < scroll_top) {
			scroll_top = option_top;
		}
		else if(scroll_top + container_height <= option_top) {
			if(top) {
				scroll_top = option_top;
			}
			else {
				scroll_top = option_top - container_height + option_height;
			}
		}

		highlighted_option_index = index;
		renderOptions(scroll_top);
	}

	/**
	 * Selects the currently highlighted option and assigns its value to the currently active select
	 */
	function selectHighlightedOption() {
		var option = filtered_options[highlighted_option_index];
		if(option === undefined) {
			return;
		}

		var index       = option.index;
		var new_indexes = index;

		// Multiple selects need to toggle the selected option based on if it
		// already exists within the selected options or not
		if(isMultiple.call($active_select)) {
			var new_indexes = getSelectedIndexes.call($active_select);
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
		setSelectedIndexes.call($active_select, new_indexes, true);
	}

	/**
	 * Generates a map between values and indexes
	 * @param  {Array} option_array The array of options
	 * @return {Object}             The value map
	 */
	function generateOptionValueMap(option_array) {
		var map = {};

		for(var i = 0; i < option_array.length; ++i) {
			var option = option_array[i];
			map[option.value] = i;
		}

		return map;
	}

	/**
	 * Gets the option value map for a select
	 * @return {Object} The value map
	 */
	function getOptionValueMap() {
		var index = $(this).attr('data-swift-select-options');
		return option_array_value_maps[index] || {};
	}

	/**
	 * Calculates the width of the select based on widest option.
	 * In older browsers that don't support canvas, the width is
	 * approximated, possibly failing miserably.
	 * @param  {Array}  options_array The array of options
	 * @return {Number}               The width of the widest option
	 */
	function calculateWidth(options_array) {
		var $this = $(this);

		// Set the font CSS on the canvas
		canvas_context.font = $this.css('font');

		var max_width = 0;
		var width;

		for(var i = 0; i < options_array.length; ++i) {
			var option = options_array[i];

			// In modern browsers, we can accurately measure the text using the canvas
			if(supports.canvas) {
				width = canvas_context.measureText(option.text).width;
			}
			// In older browser, use the text length
			else {
				width = option.text.length;
			}

			max_width = Math.max(width, max_width);
		}

		// Add the button's width
		var button_width = findInShadowRoot.call($this, '.button').outerWidth();
		max_width += button_width;

		// Add some extra pixels to be safe
		max_width += 10;

		// In modern browsers, use the precise pixel width
		if(supports.canvas) {
			return max_width + 'px';
		}
		// In older browsers, approximate using ems
		else {
			return (width * .75) + 'em';
		}
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

	/**
	 * Filters an option array based on given text
	 * @param  {Array}  option_array The option array to filter
	 * @param  {String} filter_text  The text to filter by
	 * @return {Array}               The filtered option array
	 */
	function filterOptionArray(option_array, filter_text) {
		var filtered_options = option_array;

		if(filter_text === undefined || filter_text === null) {
			filter_text = '';
		}
		filter_text += '';

		// Filter only if text was passed in
		if(filter_text.length) {
			var filter_function = getConfigOption.call(this, 'filter_function');

			if(typeof filter_function !== 'function') {
				throw new Error('Invalid filter function: ' + filter_function);
			}

			filtered_options = filter_function(filter_text, option_array);
		}
		// Otherwise, reset the filtered options to the full option array
		else {
			for(var i = 0; i < option_array.length; ++i) {
				var option = option_array[i];
				option.highlight_text = option.text;
			}
		}

		return filtered_options;
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
	 * @return {Array} An array of selected values
	 */
	function getValues() {
		var current_indexes = getSelectedIndexes.call(this);
		var options         = getOptionArray.call(this);
		var values          = [];

		for(var i = 0; i < current_indexes.length; ++i) {
			var index  = current_indexes[i];
			var option = options[index];

			if(option) {
				values.push(option.value);
			}
		}

		return values;
	}

	/**
	 * Sets the selected values of a select
	 * @param {String|Array} indexes        A value or array of values to select
	 * @param {Boolean}      trigger_change Set to true to trigger a change event if the values have changed
	 */
	function setValues(values, trigger_change) {
		if(!(values instanceof Array)) {
			values = [values];
		}

		return $(this).each(function() {
			var option_value_map = getOptionValueMap.call(this);
			var indexes          = [];

			for(var i = 0; i < values.length; ++i) {
				var value = values[i];
				var index = option_value_map[value];

				if(index) {
					indexes.push(index);
				}
			}

			setSelectedIndexes.call(this, indexes, trigger_change);
		});
	}

	/**
	 * Gets all selected indexes of a select
	 * @return {Array} An array of selected indexes
	 */
	function getSelectedIndexes() {
		var indexes = $(this).data('swift-select-indexes') || [];

		return indexes.slice(0);
	}

	/**
	 * Sets the selected indexes of a select
	 * @param {Number|Array} indexes        An index or array of indexes to select
	 * @param {Boolean}      trigger_change Set to true to trigger a change event if the indexes have changed
	 */
	function setSelectedIndexes(indexes, trigger_change) {
		if(indexes === undefined || indexes === null) {
			indexes = [];
		}
		else if(!(indexes instanceof Array)) {
			indexes = [indexes];
		}

		return $(this).each(function() {
			var current_indexes = getSelectedIndexes.call(this);
			var options         = getOptionArray.call(this);
			var new_indexes     = [];

			for(var i = 0; i < indexes.length; ++i) {
				var index = +indexes[i];
				if(isNaN(index)) {
					continue;
				}

				var option = options[index];
				var valid  = !!option;

				if(valid) {
					new_indexes.push(index);
				}
			}

			new_indexes.sort();

			// Set the new indexes
			$(this).data('swift-select-indexes', new_indexes);

			// Get the new value list
			var values = getValues.call(this);

			var text = [];
			for(var i = 0; i < new_indexes.length; ++i) {
				var index  = new_indexes[i];
				var option = options[index];

				if(option) {
					text.push(option.text);
				}
			}

			setText.call(this, text.join(', '));

			if(!isMultiple.call(this)) {
				getHiddenInput.call(this).val(values[0]);
			}
			else {
				getHiddenInput.call(this).val(JSON.stringify(values));
			}

			// Trigger a change if the indexes have changed
			if(trigger_change) {
				for(var i = 0; i < new_indexes.length; ++i) {
					if(new_indexes[i] !== current_indexes[i]) {
						$(this).trigger('change').trigger('swift-select-change');
						break;
					}
				}
			}
		});
	}

	/**
	 * Gets the display text of a select
	 * @return {Object} A jQuery collection containing the element
	 */
	function getText() {
		return getTextElement.call(this).text();
	}

	/**
	 * Sets the display text of a select
	 * @return {Object} A jQuery collection containing the element
	 */
	function setText(text) {
		return getTextElement.call(this).text(text);
	}

	/**
	 * Focuses a select
	 * @return {Object} A jQuery collection containing the element
	 */
	function focus() {
		return getContainer.call(this).focus();
	}

	/**
	 * Blurs a select
	 * @return {Object} A jQuery collection containing the element
	 */
	function blur() {
		return getContainer.call(this).blur();
	}

	/**
	 * Gets the container element within a select
	 * @return {Object} A jQuery collection containing the element
	 */
	function getContainer() {
		return findInShadowRoot.call(this, '.container');
	}

	/**
	 * Gets the text element within a select
	 * @return {Object} A jQuery collection containing the element
	 */
	function getTextElement() {
		return findInShadowRoot.call(this, '.text');
	}

	/**
	 * Gets the hidden input within a select
	 * The hidden input is used for traditional form submission
	 * @return {Object} A jQuery collection containing the element
	 */
	function getHiddenInput() {
		return $(this).find('.hidden-input');
	}


	// =========================================================================
	// Shadow Root Manipulation
	// =========================================================================

	/**
	 * Creates a shadow root using a template
	 * @param  {Object} $template A template element
	 * @return {Object}           A jQuery collection containing the created shadow root
	 */
	function createShadowRoot($template) {
		var $this = $(this);
		$template = $($template);

		// Create the shadow root
		if(supports.components) {
			var element = $this.get(0);
			var method  = element.createShadowRoot || element.webkitCreateShadowRoot;
			var $root   = $(method.call(element));
		}
		// Create the shadow root element
		else {
			var $root = $('<div class="swift-select-shadow-root"></div>');
		}

		// Append the template to the root
		$root.append($template.clone())
		$root.appendTo($this);

		return $root;
	}

	/**
	 * Returns the shadow root of an element
	 * @return {Object} A jQuery collection of the found shadow roots
	 */
	function getShadowRoot() {
		var $this = $(this);

		if(supports.components) {
			var roots = [];
			for(var i = 0; i < $this.length; ++i) {
				var element = $this.get(i);
				roots.push(element.shadowRoot || element.webkitShadowRoot);
			}
			return $(roots);
		}

		return $this.find('.swift-select-shadow-root');
	}

	/**
	 * Finds an element within a shadow root
	 * @param  {String} selector A CSS selector
	 * @return {Object}          A jQuery collection of the found elements
	 */
	function findInShadowRoot(selector) {
		var $roots = getShadowRoot.call(this);

		var $elements = $();

		for(var i = 0; i < $roots.length; ++i) {
			var root = $roots.get(i);

			$elements = $elements.add($(root).find(selector));
		}
		return $elements;
	}

	// =========================================================================
	// jQuery Plugin
	// =========================================================================
	var methods = {
		initialize: function() {
			return initialize.apply(this, arguments);
		},

		config: function(option, value) {
			if(!option) {
				return;
			}

			// If option is an object, we must be setting multiple config options at once
			if(typeof option === 'object') {
				for(var i in option) {
					var new_config = $.extend(true, {}, getConfigObject.call(this));
					setConfigObject.call(this, new_config);
				}
			}
			// If no arguments were passed. return the entire config object
			else if(!arguments.length) {
				return $.extend(true, {}, getConfigObject.call(this));
			}
			// If only one argument was passed, we must be getting a config option
			else if(arguments.length === 1) {
				return getConfigOption.call(this, option);
			}

			// If we've made it this far, we must be setting a config option
			return setConfigOption.call(this, option, value);
		},

		options: function() {
			if(arguments.length) {
				return setOptionArray.apply(this, arguments);
			}

			return $.extend(true, [], getOptionArray.call(this));
		},

		showOptions: function() {
			showOptions.call(this);
		},

		filterOptions: function(filter_text) {
			filterOptions.call(this, filter_text);
		},

		hideOptions: function() {
			hideOptions();
		},

		value: function() {
			if(arguments.length) {
				return setValues.apply(this, arguments);
			}

			var values = getValues.call(this);

			if(!isMultiple.call(this)) {
				return values[0] || "";
			}

			return values;
		},

		selectedIndex: function() {
			if(arguments.length) {
				return setSelectedIndexes.apply(this, arguments);
			}

			var current_indexes = getSelectedIndexes.call(this);

			if(!isMultiple.call(this)) {
				return current_indexes[0] || -1;
			}

			return current_indexes;
		},

		text: function() {
			if(arguments.length) {
				return setText.apply(this, arguments);
			}

			return getText.call(this);
		},

		focus: function() {
			return focus.call(this);
		},

		blur: function() {
			return blur.call(this);
		}
	};

	$.fn.swiftSelect = function() {
		var args      = Array.prototype.slice.call(arguments, 0);
		var method    = args.shift();
		var $elements = $(this);

		// If no method was passed, just initialize
		if(method === undefined || typeof method === 'object') {
			return initialize.apply($elements, arguments);
		}
		// Otherwise, initialize with the default configuration
		else {
			$elements = initialize.call($elements);
		}

		// Attempt to call the method
		if(methods[method]) {
			return methods[method].apply($elements, args);
		}

		throw new Error('Invalid SwiftSelect method: ' + method);
	};
}(jQuery, window));