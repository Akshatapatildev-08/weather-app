export default function SearchBar({
  searchTerm,
  onSearchTermChange,
  suggestions,
  onSuggestionPick,
  onSearch,
  loading,
}) {
  return (
    <div className="glass search-wrap">
      <div className="search-row">
        <input
          className="search-input"
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          placeholder="Search city, country..."
        />
        <button className="btn-primary" onClick={onSearch} disabled={loading || !searchTerm.trim()}>
          {loading ? 'Loading...' : 'Search'}
        </button>
      </div>
      {suggestions.length > 0 && (
        <div className="suggestions">
          {suggestions.map((item) => (
            <button
              key={`${item.raw.id || item.label}`}
              className="suggestion"
              onClick={() => onSuggestionPick(item.query)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}