/*!
 * FatFinger Fuzzy Text Search
 * https://github.com/Knotix/FatFinger/
 *
 * Copyright 2013 Samuel Hodge
 * Released under the GPL license
 * http://www.gnu.org/licenses/gpl.html
 */
(function(context) {
	'use strict';

	// Add FatFinger to the current context
	context['fatfinger'] = fatfinger;

	// Create the mark element for IE compatibility
	document.createElement('mark');

	// RegExp used to escape RegExp special characters
	var escape_regex = /([-[\]{}()*+?.,\\^$|#\s])/g;

	// Store a reference to the hasOwnProperty method
	var has_own_property = Object.prototype.hasOwnProperty;

	/**
	 * Performs a fuzzy search with an array of strings
	 * @param  {String}   needle              The string to search for
	 * @param  {Array}    haystacks           An array of strings to search in
	 * @param  {Number=}  include_non_matches Set to true to include results with no matches
	 * @param  {Number=}  result_limit        The maximum number of results
	 * @return {Array}                        An array of search results
	 */
	function fatfinger(needle, haystacks, include_non_matches, result_limit) {
		haystacks = haystacks || [];
		needle    = needle || '';

		// If there is no needle, we are done
		if(!needle.length) {
			if(include_non_matches) {
				return haystacks;
			}

			return [];
		}

		// Create a RegExp pattern with every permutation of contiguous characters
		var pattern      = [];
		var unique_parts = {};
		for(var i = needle.length; i > 1; --i) {
			var permutations = needle.length - i;

			for(var j = 0; j <= permutations; ++j) {
				var pattern_part = needle.slice(j, j + i).replace(escape_regex, '\\$1');

				if(!unique_parts[pattern_part]) {
					unique_parts[pattern_part] = true;
					pattern.push(pattern_part);
				}
			}
		}

		// Add a single character pattern
		pattern.push('[' + needle.replace(escape_regex, '\\$1') + ']');

		// Create the RegExp string
		pattern = '(' + pattern.join('|') + ')';

		// Instantiate the RegExp
		var needle_regexp = new RegExp(pattern, 'gi');

		// Loop through each haystack and search for the needle
		var results = [];
		for(var i = 0; i < haystacks.length; ++i) {
			if(!has_own_property.call(haystacks, i)) {
				continue;
			}

			// Support for haystack objects that have a "text" property
			var haystack = haystacks[i] || '';
			if(typeof haystack === 'object') {
				haystack = haystack.text || '';
			}

			var match_percentage    = 0;
			var match_count         = 0;
			var longest_chain       = 0;
			var longest_chain_index = 0;
			var text                = null;

			if(haystack.length) {
				text = '';
				var regexp_match;
				var last_index = 0;

				// Execute the needle RegExp on the haystack
				while(regexp_match = needle_regexp.exec(haystack)) {
					var regexp_index = needle_regexp.lastIndex;
					var match        = regexp_match[0];
					var length       = match.length;

					// Increase the match counter
					match_count += length;

					// Store the longest chain
					if(longest_chain < length) {
						longest_chain       = length;
						longest_chain_index = regexp_index;
					}

					// Create the highlight text
					text += haystack.slice(last_index, regexp_index - length);
					text += '<mark>' + match + '</mark>';

					last_index = regexp_index;
				}

				// Append the remaining characters of the haystack
				text += haystack.slice(regexp_index);

				// Calculate the match percentage
				match_percentage = match_count / haystack.length;
			}

			// Remove non-matches if needed
			if(!include_non_matches && match_count === 0) {
				continue;
			}

			// Add the result to the results array
			results.push({
				index               : i,
				haystack_length     : haystack.length,
				match_percentage    : match_percentage,
				match_count         : match_count,
				longest_chain       : longest_chain,
				longest_chain_index : longest_chain_index,
				highlight_text      : text || haystack
			});
		}

		// Sort the results
		results.sort(sortSearchResults);

		// Limit the result count if needed
		if(result_limit) {
			results = results.slice(0, result_limit);
		}

		return results;
	}

	/**
	 * Sorts search results
	 * @param  {Object} a The first search result
	 * @param  {Object} b The second search result
	 * @return {number}   The relative direction to move the elements
	 */
	function sortSearchResults(a, b) {
		var tmp_a;
		var tmp_b;

		tmp_a = -a.longest_chain;
		tmp_b = -b.longest_chain;

		if(tmp_a === tmp_b) {
			tmp_a = a.longest_chain_index;
			tmp_b = b.longest_chain_index;

			if(tmp_a === tmp_b) {
				tmp_a = a.haystack_length;
				tmp_b = b.haystack_length;

				if(tmp_a === tmp_b) {
					tmp_a = -a.match_percentage;
					tmp_b = -b.match_percentage;

					if(tmp_a === tmp_b) {
						tmp_a = -a.match_count;
						tmp_b = -b.match_count;

						if(tmp_a === tmp_b) {
							tmp_a = a.haystack;
							tmp_b = b.haystack;

							if(tmp_a === tmp_b) {
								tmp_a = a.index;
								tmp_b = b.index;
							}
						}
					}
				}
			}
		}

		return tmp_a < tmp_b ? -1 : 1;
	}
}(this));
