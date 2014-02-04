FatFinger
=========

FatFinger is a lightweight fuzzy text search function that makes searching a list of options as easy as smashing your face on the keyboard.

Usage
---------

	var options = [
		'Apples',
		'Apple Pie',
		'Apple Cider',
		'Applesauce',
		'Round of Applause',

		'Cherries',
		'Cherry Garcia',
		'Cherry Pie',
		'Pretty please with a cherry on top',

		'Bananas',
		'Banana Juice',
		'Banana Split',
		'Gone Bananas',
		'Time flies like the wind. Fruit flies like bananas'
	];

	var results = fatfinger(options, 'Applause');

Arguments
---------

FatFinger accepts the following arguments:

<table>
	<tr>
		<th>Argument</th>
		<th>Description</th>
	</tr>
	<tr>
		<td>needle</td>
		<td>The string to search for</td>
	</tr>
	<tr>
		<td>haystacks</td>
		<td>An array of strings to search in</td>
	</tr>
	<tr>
		<td>include_non_matches (optional)</td>
		<td>Set to true to include results with no matches</td>
	</tr>
	<tr>
		<td>result_limit (optional)</td>
		<td>The maximum number of results</td>
	</tr>
</table>

Results
---------

FatFinger returns an array of result objects sorted by how close haystack matches.
Each result object contains the following properties:

<table>
	<tr>
		<th>Property</th>
		<th>Description</th>
	</tr>
	<tr>
		<td>index</td>
		<td>The index of the haystack within the original array of haystacks</td>
	</tr>
	<tr>
		<td>haystack_length</td>
		<td>The length of the haystack</td>
	</tr>
	<tr>
		<td>match_percentage</td>
		<td>The percentage of haystack characters matching the needle</td>
	</tr>
	<tr>
		<td>match_count</td>
		<td>The number of haystack characters matching the needle</td>
	</tr>
	<tr>
		<td>longest_chain</td>
		<td>The longest consecutive chain of haystack characters matching the needle</td>
	</tr>
	<tr>
		<td>longest_chain_index</td>
		<td>The character index of the longest consecutive chain of haystack characters matching the needle</td>
	</tr>
	<tr>
		<td>highlight_text</td>
		<td>The haystack with matches wrapped in &lt;mark&gt; elements. This is useful for visually highlighting what parts of the haystack match the needle</td>
	</tr>
</table>
