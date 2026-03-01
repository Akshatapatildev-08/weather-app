import { useMemo, useState } from 'react';
import { getCurrent, getForecast, getHistorical, getMarine } from './api';
import { filterForecast, todayISO } from './utils';
import SearchBar from './components/SearchBar';
import Filters from './components/Filters';
import StatCard from './components/StatCard';

const TABS = ['current', 'forecast', 'historical', 'marine', 'location'];

export default function App() {
  const [activeTab, setActiveTab] = useState('current');
  const [searchTerm, setSearchTerm] = useState('New York');
  const [selectedQuery, setSelectedQuery] = useState('New York');
  const [recentSearches, setRecentSearches] = useState(['New York']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorTab, setErrorTab] = useState('');
  const [geo, setGeo] = useState(null);

  const [currentData, setCurrentData] = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [historicalData, setHistoricalData] = useState(null);
  const [marineData, setMarineData] = useState(null);
  const [locationData, setLocationData] = useState(null);

  const [historicalDate, setHistoricalDate] = useState(todayISO());
  const [marineDate, setMarineDate] = useState(todayISO());
  const [minTemp, setMinTemp] = useState(null);
  const [conditionFilter, setConditionFilter] = useState('');

  const suggestions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) {
      return [];
    }
    return recentSearches
      .filter((item) => item.toLowerCase().includes(q))
      .slice(0, 5)
      .map((item) => ({
        label: item,
        query: item,
        raw: { id: item },
      }));
  }, [recentSearches, searchTerm]);

  function addRecentQuery(query) {
    const clean = query.trim();
    if (!clean) {
      return;
    }
    setRecentSearches((prev) => [clean, ...prev.filter((x) => x.toLowerCase() !== clean.toLowerCase())].slice(0, 8));
  }

  function normalizeQueryInput(query) {
    const q = query.trim();
    const lower = q.toLowerCase();
    if (lower === 'banglore') {
      return 'Bangalore, India';
    }
    return q;
  }

  async function runSearch(forceTab, queryOverride) {
    const tab = forceTab || activeTab;
    const query = normalizeQueryInput(queryOverride || selectedQuery || '');
    if (!query) {
      setError('Enter a location to search.');
      return;
    }

    setError('');
    setErrorTab('');
    setLoading(true);

    try {
      if (tab === 'current') {
        const data = await getCurrent(query);
        setCurrentData(data);
        setLocationData(data?.location || null);
        if (data?.location?.lat && data?.location?.lon) {
          setGeo({ lat: data.location.lat, lon: data.location.lon });
        }
      }

      if (tab === 'forecast') {
        const data = await getForecast(query, 7);
        setForecastData(data);
      }

      if (tab === 'historical') {
        const data = await getHistorical(query, historicalDate);
        setHistoricalData(data);
      }

      if (tab === 'marine') {
        let lat = geo?.lat;
        let lon = geo?.lon;

        if (!lat || !lon) {
          const current = await getCurrent(query);
          lat = current?.location?.lat;
          lon = current?.location?.lon;
          if (lat && lon) {
            setGeo({ lat, lon });
          }
        }

        if (!lat || !lon) {
          throw new Error('Unable to resolve coordinates for marine weather.');
        }

        const data = await getMarine(lat, lon, marineDate);
        setMarineData(data);
      }

      if (tab === 'location') {
        if (currentData?.location) {
          setLocationData(currentData.location);
        } else {
          const data = await getCurrent(query);
          setCurrentData(data);
          setLocationData(data?.location || null);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch weather data.');
      setErrorTab(tab);
    } finally {
      setLoading(false);
    }
  }

  const filteredForecast = useMemo(() => {
    return filterForecast(forecastData?.forecast, minTemp, conditionFilter);
  }, [forecastData, minTemp, conditionFilter]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>Atmos Console</h1>
        <p>Weather intelligence workspace powered by Weatherstack</p>
      </header>

      <SearchBar
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        suggestions={suggestions}
        onSuggestionPick={(query) => {
          const normalized = normalizeQueryInput(query);
          setSearchTerm(normalized);
          setSelectedQuery(normalized);
          addRecentQuery(normalized);
          setActiveTab('current');
          runSearch('current', normalized);
        }}
        onSearch={() => {
          const query = normalizeQueryInput(searchTerm);
          setSearchTerm(query);
          setSelectedQuery(query);
          addRecentQuery(query);
          setActiveTab('current');
          runSearch('current', query);
        }}
        loading={loading}
      />

      <div className="tabs glass">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => {
              setActiveTab(tab);
              setError('');
              setErrorTab('');
              if (tab === 'forecast' || tab === 'location') {
                runSearch(tab);
              }
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {error && errorTab === activeTab && <div className="glass error">{error}</div>}

      {activeTab === 'current' && currentData?.current && (
        <section className="grid">
          <StatCard
            title="Location"
            value={currentData.location?.name || '-'}
            subtitle={`${currentData.location?.country || ''} | ${currentData.location?.localtime || ''}`}
          />
          <StatCard
            title="Temperature"
            value={`${currentData.current.temperature} C`}
            subtitle={(currentData.current.weather_descriptions || []).join(', ')}
          />
          <StatCard title="Humidity" value={`${currentData.current.humidity}%`} />
          <StatCard title="Wind" value={`${currentData.current.wind_speed} km/h`} />
        </section>
      )}

      {activeTab === 'forecast' && (
        <section>
          <Filters
            minTemp={minTemp}
            condition={conditionFilter}
            onMinTempChange={setMinTemp}
            onConditionChange={setConditionFilter}
          />
          <div className="grid">
            {filteredForecast.map((day) => (
              <StatCard
                key={day.date}
                title={day.date}
                value={`${day.maxtemp} / ${day.mintemp} C`}
                subtitle={day.hourly?.[0]?.weather_descriptions?.[0] || 'N/A'}
              />
            ))}
          </div>
          {!error && filteredForecast.length === 0 && (
            <div className="glass error">No forecast data yet. Open this tab after searching a location.</div>
          )}
        </section>
      )}

      {activeTab === 'historical' && (
        <section>
          <div className="glass inline-controls">
            <label>
              Historical Date
              <input
                type="date"
                value={historicalDate}
                max={todayISO()}
                onChange={(e) => setHistoricalDate(e.target.value)}
              />
            </label>
            <button
              className="btn-primary"
              onClick={() => runSearch('historical')}
            >
              Load Historical
            </button>
          </div>
          <div className="grid">
            {Object.entries(historicalData?.historical || {}).map(([date, payload]) => (
              <StatCard
                key={date}
                title={date}
                value={`${payload?.maxtemp} / ${payload?.mintemp} C`}
                subtitle={payload?.hourly?.[0]?.weather_descriptions?.[0] || 'N/A'}
              />
            ))}
          </div>
          {!error && Object.keys(historicalData?.historical || {}).length === 0 && (
            <div className="glass error">No historical data yet. Click "Load Historical" to fetch.</div>
          )}
        </section>
      )}

      {activeTab === 'marine' && (
        <section>
          <div className="glass inline-controls">
            <label>
              Marine Date
              <input type="date" value={marineDate} onChange={(e) => setMarineDate(e.target.value)} />
            </label>
            <button
              className="btn-primary"
              onClick={() => runSearch('marine')}
            >
              Load Marine
            </button>
          </div>
          <div className="grid">
            {Object.entries(marineData?.marine || {}).map(([date, payload]) => (
              <StatCard
                key={date}
                title={date}
                value={`${payload?.hourly?.[0]?.waterTemperature || '-'} C water`}
                subtitle={`Wave: ${payload?.hourly?.[0]?.swellHeight || '-'} m`}
              />
            ))}
          </div>
          {!error && Object.keys(marineData?.marine || {}).length === 0 && (
            <div className="glass error">No marine data yet. Click "Load Marine" to fetch.</div>
          )}
        </section>
      )}

      {activeTab === 'location' && (
        <section className="grid">
          {locationData ? (
            <StatCard
              title={locationData.name || 'Location'}
              value={`${locationData.country || '-'} (${locationData.timezone_id || 'N/A'})`}
              subtitle={`Lat ${locationData.lat}, Lon ${locationData.lon}`}
            />
          ) : (
            <StatCard title="Location" value="No data yet" subtitle="Run a current weather search first." />
          )}
        </section>
      )}
    </div>
  );
}
