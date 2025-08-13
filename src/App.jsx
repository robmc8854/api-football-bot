import React, { useState, useEffect } from 'react';
import {
  Calendar,
  TrendingUp,
  Users,
  MapPin,
  Clock,
  Star,
  BarChart3,
  Target,
  Globe,
  AlertTriangle
} from 'lucide-react';

const SportMonkPredictionBot = () => {
  const [apiKey, setApiKey] = useState('');
  const [selectedLeague, setSelectedLeague] = useState('');
  const [leagues, setLeagues] = useState([]);
  const [fixtures, setFixtures] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [standings, setStandings] = useState([]);
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [headToHeadData, setHeadToHeadData] = useState([]);
  const [weatherData, setWeatherData] = useState({});
  const [teamForm, setTeamForm] = useState({});
  const [injuries, setInjuries] = useState({});
  const [teamSquads, setTeamSquads] = useState({});
  const [valueBets, setValueBets] = useState([]);
  const [selectedView, setSelectedView] = useState('predictions'); // predictions, value-bets, analytics

  // ---------- helpers ----------
  const calculateH2HFactor = (h2hFixtures, homeTeamId) => {
    if (!h2hFixtures || h2hFixtures.length === 0) return 0;
    const recentH2H = h2hFixtures.slice(-5);
    let homeWins = 0;
    const totalGames = recentH2H.length;

    recentH2H.forEach((fixture) => {
      const homeScore =
        fixture.scores?.find((s) => s.participant_id === homeTeamId)?.score?.total || 0;
      const awayScore =
        fixture.scores?.find((s) => s.participant_id !== homeTeamId)?.score?.total || 0;
      if (homeScore > awayScore) homeWins++;
    });

    return totalGames > 0 ? homeWins / totalGames - 0.5 : 0;
  };

  const calculateWeatherImpact = (weather) => {
    if (!weather) return 1;
    let factor = 1;
    if (weather.temperature_celsius < 5 || weather.temperature_celsius > 35) factor *= 0.95;
    if (weather.wind_speed > 20) factor *= 0.9;
    if (weather.weather_report?.description?.toLowerCase().includes('rain')) factor *= 0.85;
    return factor;
  };

  const calculateConfidence = (data) => {
    const { homeWinProb, awayWinProb, drawProb, standingsReliability, formReliability, h2hReliability } = data;
    const maxProb = Math.max(homeWinProb, awayWinProb, drawProb);
    const decisiveness = (maxProb - 0.33) / 0.67;
    const dataReliability = (standingsReliability + formReliability + h2hReliability) / 3;
    return Math.min(0.95, Math.max(0.1, decisiveness * 0.7 + dataReliability * 0.3));
  };

  // ---------- model ----------
  const calculateAdvancedPrediction = (fixture, additionalData = {}) => {
    const homeTeam = fixture.participants?.[0];
    const awayTeam = fixture.participants?.[1];
    if (!homeTeam || !awayTeam) return null;

    const { standings = [], headToHead = [], weather = null, form = {} } = additionalData;

    const homeStanding = standings.find((s) => s.participant_id === homeTeam.id) || {};
    const awayStanding = standings.find((s) => s.participant_id === awayTeam.id) || {};

    const homePosition = homeStanding.position || 10;
    const awayPosition = awayStanding.position || 10;
    const homePoints = homeStanding.points || 20;
    const awayPoints = awayStanding.points || 20;

    const homeFormScore = form[homeTeam.id]?.formScore || 0.5;
    const awayFormScore = form[awayTeam.id]?.formScore || 0.5;

    const h2hFactor = calculateH2HFactor(headToHead, homeTeam.id);
    const weatherFactor = calculateWeatherImpact(weather);
    const homeAdvantage = 0.1;

    let homeWinProb = 0.4 + homeAdvantage;
    let awayWinProb = 0.3;
    let drawProb = 0.3;

    const positionDiff = (awayPosition - homePosition) / 20;
    homeWinProb += positionDiff * 0.2;
    awayWinProb -= positionDiff * 0.2;

    const pointsDiff = (homePoints - awayPoints) / 50;
    homeWinProb += pointsDiff * 0.15;
    awayWinProb -= pointsDiff * 0.15;

    homeWinProb += (homeFormScore - 0.5) * 0.2;
    awayWinProb += (awayFormScore - 0.5) * 0.2;

    homeWinProb += h2hFactor * 0.1;
    awayWinProb -= h2hFactor * 0.1;

    homeWinProb *= weatherFactor;

    const total = homeWinProb + awayWinProb + drawProb;
    homeWinProb /= total;
    awayWinProb /= total;
    drawProb /= total;

    const homeXG = Math.max(0.5, 1.5 + (homeFormScore - awayFormScore) * 2);
    const awayXG = Math.max(0.5, 1.2 + (awayFormScore - homeFormScore) * 2);

    const totalXG = homeXG + awayXG;
    const over25Prob = totalXG > 2.5 ? 0.6 + (totalXG - 2.5) * 0.15 : 0.4 - (2.5 - totalXG) * 0.15;

    const bttsProb = Math.min(0.9, Math.max(0.1, (homeXG * awayXG) / 4));

    const confidence = calculateConfidence({
      homeWinProb,
      awayWinProb,
      drawProb,
      over25Prob,
      bttsProb,
      standingsReliability: standings.length > 0 ? 0.8 : 0.3,
      formReliability: Object.keys(form).length > 0 ? 0.7 : 0.2,
      h2hReliability: headToHead.length > 0 ? 0.6 : 0.1
    });

    return {
      match_winner: {
        home: Math.round(homeWinProb * 100),
        draw: Math.round(drawProb * 100),
        away: Math.round(awayWinProb * 100)
      },
      over_under_25: {
        over: Math.round(over25Prob * 100),
        under: Math.round((1 - over25Prob) * 100)
      },
      both_teams_score: {
        yes: Math.round(bttsProb * 100),
        no: Math.round((1 - bttsProb) * 100)
      },
      expected_goals: {
        home: homeXG.toFixed(1),
        away: awayXG.toFixed(1),
        total: (homeXG + awayXG).toFixed(1)
      },
      confidence: Math.round(confidence * 100),
      factors: {
        form: { home: homeFormScore, away: awayFormScore },
        standings: { home: homePosition, away: awayPosition },
        headToHead: h2hFactor,
        weather: weatherFactor,
        homeAdvantage: homeAdvantage
      }
    };
  };

  // ---------- API helper ----------
  const makeAPICall = async (endpoint, params = {}) => {
    if (!apiKey && endpoint !== 'demo') {
      return getDemoData(endpoint);
    }
    try {
      const queryString = new URLSearchParams({
        api_token: apiKey,
        ...params
      }).toString();

      const response = await fetch(`https://api.sportmonks.com/v3/${endpoint}?${queryString}`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('API Error:', error);
      return getDemoData(endpoint);
    }
  };

  // ---------- fetchers ----------
  const fetchLeagues = async () => {
    const data = await makeAPICall('football/leagues', {
      include: 'country',
      per_page: 50
    });
    setLeagues(data.data || []);
  };

  const fetchFixtures = async (date) => {
    setLoading(true);
    try {
      const data = await makeAPICall(`football/fixtures/date/${date}`, {
        include: 'participants,scores,state,league,venue,weatherreport,odds',
        per_page: 100
      });
      setFixtures(data.data || []);
    } catch (error) {
      console.error('Error fetching fixtures:', error);
    }
    setLoading(false);
  };

  const fetchStandings = async (leagueId) => {
    if (!leagueId) return;
    try {
      const seasonsData = await makeAPICall(`football/seasons`, {
        'filter[league_id]': leagueId,
        include: 'league'
      });

      const currentSeason = seasonsData.data?.[0];
      if (currentSeason) {
        const data = await makeAPICall(`football/standings/seasons/${currentSeason.id}`, {
          include: 'participant'
        });
        setStandings(data.data?.[0]?.standings || []);
      }
    } catch (error) {
      console.error('Error fetching standings:', error);
    }
  };

  const fetchTeamSquads = async (teamIds) => {
    const squads = {};
    for (const teamId of teamIds.slice(0, 10)) {
      try {
        const data = await makeAPICall(`football/squads/teams/${teamId}`, {
          include: 'player.position'
        });
        squads[teamId] = data.data || [];
      } catch (error) {
        console.error(`Error fetching squad for team ${teamId}:`, error);
        squads[teamId] = [];
      }
    }
    setTeamSquads(squads);
  };

  const fetchInjuries = async (teamIds) => {
    const injuryData = {};
    teamIds.forEach((teamId) => {
      const hasInjuries = Math.random() > 0.7;
      injuryData[teamId] = hasInjuries
        ? [{ player_id: Math.floor(Math.random() * 1000), severity: 'minor' }]
        : [];
    });
    setInjuries(injuryData);
  };

  const fetchHeadToHead = async (teamA, teamB) => {
    try {
      const data = await makeAPICall(`football/fixtures/head-to-head/${teamA}/${teamB}`, {
        include: 'participants,scores'
      });
      setHeadToHeadData(data.data || []);
    } catch (error) {
      console.error('Error fetching head-to-head:', error);
    }
  };

  const fetchTeamForm = async (teamIds) => {
    const formData = {};
    for (const teamId of teamIds) {
      try {
        const data = await makeAPICall(
          `football/fixtures/between/2024-01-01/2024-12-31/${teamId}`,
          { include: 'participants,scores', per_page: 5 }
        );
        const fixturesArr = data.data || [];
        let wins = 0,
          draws = 0,
          losses = 0;

        fixturesArr.forEach((fixture) => {
          const teamScore =
            fixture.scores?.find((s) => s.participant_id === teamId)?.score?.total || 0;
          const opponentScore =
            fixture.scores?.find((s) => s.participant_id !== teamId)?.score?.total || 0;

          if (teamScore > opponentScore) wins++;
          else if (teamScore === opponentScore) draws++;
          else losses++;
        });

        const totalGames = wins + draws + losses;
        const formScore = totalGames > 0 ? (wins * 3 + draws) / (totalGames * 3) : 0.5;

        formData[teamId] = {
          wins,
          draws,
          losses,
          formScore,
          form: `${wins}W-${draws}D-${losses}L`
        };
      } catch (error) {
        console.error(`Error fetching form for team ${teamId}:`, error);
        formData[teamId] = { formScore: 0.5, form: 'N/A' };
      }
    }
    setTeamForm(formData);
  };

  // ---------- value-bet calc ----------
  const calculateValueBets = (preds) => {
    return preds.map((match) => {
      if (!match.odds) return { ...match, valueBets: [] };

      const valueBetsLocal = [];
      const pred = match.prediction;

      if (match.odds.match_winner) {
        const homeOdds = match.odds.match_winner.home;
        const drawOdds = match.odds.match_winner.draw;
        const awayOdds = match.odds.match_winner.away;

        if (homeOdds && drawOdds && awayOdds) {
          const homeImplied = 1 / homeOdds;
          const drawImplied = 1 / drawOdds;
          const awayImplied = 1 / awayOdds;

          const homePredicted = pred.match_winner.home / 100;
          const drawPredicted = pred.match_winner.draw / 100;
          const awayPredicted = pred.match_winner.away / 100;

          if (homePredicted > homeImplied * 1.05) {
            valueBetsLocal.push({
              market: 'Match Winner',
              selection: 'Home Win',
              odds: homeOdds,
              predictedProb: (homePredicted * 100).toFixed(1),
              impliedProb: (homeImplied * 100).toFixed(1),
              edge: ((homePredicted - homeImplied) * 100).toFixed(1)
            });
          }
          if (drawPredicted > drawImplied * 1.05) {
            valueBetsLocal.push({
              market: 'Match Winner',
              selection: 'Draw',
              odds: drawOdds,
              predictedProb: (drawPredicted * 100).toFixed(1),
              impliedProb: (drawImplied * 100).toFixed(1),
              edge: ((drawPredicted - drawImplied) * 100).toFixed(1)
            });
          }
          if (awayPredicted > awayImplied * 1.05) {
            valueBetsLocal.push({
              market: 'Match Winner',
              selection: 'Away Win',
              odds: awayOdds,
              predictedProb: (awayPredicted * 100).toFixed(1),
              impliedProb: (awayImplied * 100).toFixed(1),
              edge: ((awayPredicted - awayImplied) * 100).toFixed(1)
            });
          }
        }
      }

      return { ...match, valueBets: valueBetsLocal };
    });
  };

  // ---------- generate ----------
  const generatePredictions = async () => {
    if (!fixtures.length) return;
    setLoading(true);

    const teamIds = [
      ...new Set(fixtures.flatMap((f) => (f.participants?.map((p) => p.id) || [])))
    ];

    const tasks = [];
    if (selectedLeague) tasks.push(fetchStandings(selectedLeague));
    if (teamIds.length > 0) {
      tasks.push(fetchTeamForm(teamIds));
      tasks.push(fetchTeamSquads(teamIds));
      tasks.push(fetchInjuries(teamIds));
    }
    await Promise.all(tasks);

    const newPredictions = fixtures
      .map((fixture) => {
        if (!fixture.participants || fixture.participants.length < 2) return null;
        const prediction = calculateAdvancedPrediction(fixture, {
          standings,
          headToHead: headToHeadData,
          weather: fixture.weatherreport,
          form: teamForm
        });
        return { ...fixture, prediction };
      })
      .filter(Boolean);

    const predictionsWithValue = calculateValueBets(newPredictions);
    const allValueBets = predictionsWithValue
      .filter((p) => p.valueBets?.length > 0)
      .flatMap((p) => p.valueBets.map((vb) => ({ ...vb, fixture: p })));

    setPredictions(predictionsWithValue);
    setValueBets(allValueBets);
    setLoading(false);
  };

  // ---------- demo data ----------
  const getDemoData = (endpoint) => {
    if (endpoint.includes('leagues')) {
      return {
        data: [
          { id: 8, name: 'Premier League', country: { name: 'England' } },
          { id: 82, name: 'Bundesliga', country: { name: 'Germany' } },
          { id: 301, name: 'La Liga', country: { name: 'Spain' } },
          { id: 564, name: 'Serie A', country: { name: 'Italy' } },
          { id: 2, name: 'Champions League', country: { name: 'Europe' } }
        ]
      };
    }
    if (endpoint.includes('fixtures')) {
      return {
        data: [
          {
            id: 1,
            participants: [
              { id: 1, name: 'Manchester United', image_path: null },
              { id: 2, name: 'Liverpool', image_path: null }
            ],
            starting_at: '2024-12-15T15:00:00Z',
            state: { state: 'NS' },
            venue: { name: 'Old Trafford' },
            league: { name: 'Premier League' },
            weatherreport: {
              temperature_celsius: 12,
              wind_speed: 15,
              weather_report: { description: 'Clear sky' }
            },
            odds: {
              match_winner: { home: 2.1, draw: 3.4, away: 3.8 },
              over_under_25: { over: 1.8, under: 2.0 }
            }
          },
          {
            id: 2,
            participants: [
              { id: 3, name: 'Arsenal', image_path: null },
              { id: 4, name: 'Chelsea', image_path: null }
            ],
            starting_at: '2024-12-15T17:30:00Z',
            state: { state: 'NS' },
            venue: { name: 'Emirates Stadium' },
            league: { name: 'Premier League' },
            weatherreport: {
              temperature_celsius: 8,
              wind_speed: 22,
              weather_report: { description: 'Light rain' }
            },
            odds: {
              match_winner: { home: 1.9, draw: 3.6, away: 4.2 }
            }
          }
        ]
      };
    }
    if (endpoint.includes('standings')) {
      return {
        data: [
          {
            standings: [
              { participant_id: 1, position: 6, points: 32 },
              { participant_id: 2, position: 2, points: 45 },
              { participant_id: 3, position: 4, points: 38 },
              { participant_id: 4, position: 8, points: 28 }
            ]
          }
        ]
      };
    }
    return { data: [] };
  };

  // ---------- effects ----------
  useEffect(() => {
    fetchLeagues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedDate) fetchFixtures(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // ---------- views ----------
  const PredictionsView = ({ items }) => (
    <div className="space-y-4">
      {items.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-8 text-center border border-slate-700">
          <AlertTriangle className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No predictions yet</h3>
          <p className="text-gray-400">Load fixtures and click “Generate Advanced Predictions”.</p>
        </div>
      ) : (
        items.map((fx) => (
          <div key={fx.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold">
                {fx.participants?.[0]?.name} vs {fx.participants?.[1]?.name}
              </div>
              <div className="text-sm text-gray-400 flex items-center gap-2">
                <MapPin className="w-4 h-4" /> {fx.venue?.name || '—'}
                <span className="mx-2">•</span>
                <Calendar className="w-4 h-4" /> {new Date(fx.starting_at || Date.now()).toLocaleString()}
              </div>
            </div>

            {fx.prediction ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="bg-slate-900/50 rounded-lg p-3">
                  <div className="text-gray-400 mb-1">Match Winner</div>
                  <div>Home: <span className="font-bold">{fx.prediction.match_winner.home}%</span></div>
                  <div>Draw: <span className="font-bold">{fx.prediction.match_winner.draw}%</span></div>
                  <div>Away: <span className="font-bold">{fx.prediction.match_winner.away}%</span></div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3">
                  <div className="text-gray-400 mb-1">O/U 2.5</div>
                  <div>Over: <span className="font-bold">{fx.prediction.over_under_25.over}%</span></div>
                  <div>Under: <span className="font-bold">{fx.prediction.over_under_25.under}%</span></div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3">
                  <div className="text-gray-400 mb-1">BTTS</div>
                  <div>Yes: <span className="font-bold">{fx.prediction.both_teams_score.yes}%</span></div>
                  <div>No: <span className="font-bold">{fx.prediction.both_teams_score.no}%</span></div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3">
                  <div className="text-gray-400 mb-1">Expected Goals</div>
                  <div>Home: <span className="font-bold">{fx.prediction.expected_goals.home}</span></div>
                  <div>Away: <span className="font-bold">{fx.prediction.expected_goals.away}</span></div>
                  <div>Total: <span className="font-bold">{fx.prediction.expected_goals.total}</span></div>
                  <div className="mt-1">Confidence: <span className="font-bold">{fx.prediction.confidence}%</span></div>
                </div>
              </div>
            ) : (
              <div className="text-gray-400 text-sm">No prediction yet for this match.</div>
            )}
          </div>
        ))
      )}
    </div>
  );

  const ValueBetsView = ({ valueBets }) => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <TrendingUp className="w-6 h-6 text-green-400" />
        Value Betting Opportunities ({valueBets.length})
      </h2>

      {valueBets.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-8 text-center border border-slate-700">
          <TrendingUp className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Value Bets Found</h3>
          <p className="text-gray-400">
            No betting opportunities with sufficient edge detected in current fixtures.
            Try adjusting the minimum edge threshold or check different dates.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {valueBets
            .sort((a, b) => parseFloat(b.edge) - parseFloat(a.edge))
            .map((vb, idx) => (
              <div key={idx} className="bg-gradient-to-r from-green-900/20 to-green-800/20 border border-green-500/30 rounded-xl p-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
                  <div className="mb-4 md:mb-0">
                    <h3 className="text-lg font-bold mb-1">
                      {vb.fixture.participants[0]?.name} vs {vb.fixture.participants[1]?.name}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      <span>{vb.fixture.league?.name}</span>
                      <span>•</span>
                      <span>{new Date(vb.fixture.starting_at).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="bg-green-500/20 px-4 py-2 rounded-lg">
                      <div className="text-green-400 font-bold text-xl">+{vb.edge}%</div>
                      <div className="text-xs text-green-300">Edge</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold">{vb.odds}</div>
                      <div className="text-xs text-gray-400">Odds</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold mb-2">Betting Market</h4>
                    <div className="text-lg font-bold text-blue-400">{vb.market}</div>
                    <div className="text-sm text-gray-400">{vb.selection}</div>
                  </div>

                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold mb-2">Probability Analysis</h4>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>Our Model:</span>
                        <span className="font-bold text-green-400">{vb.predictedProb}%</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Bookmaker:</span>
                        <span className="font-bold text-red-400">{vb.impliedProb}%</span>
                      </div>
                      <div className="flex justify-between text-sm border-t border-slate-600 pt-1 mt-2">
                        <span>Edge:</span>
                        <span className="font-bold text-green-400">+{vb.edge}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <h4 className="font-semibold mb-2">Recommendation</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            parseFloat(vb.edge) > 10
                              ? 'bg-green-500'
                              : parseFloat(vb.edge) > 5
                              ? 'bg-yellow-500'
                              : 'bg-orange-500'
                          }`}
                        ></div>
                        <span>
                          {parseFloat(vb.edge) > 10
                            ? 'Strong Value'
                            : parseFloat(vb.edge) > 5
                            ? 'Good Value'
                            : 'Moderate Value'}
                        </span>
                      </div>
                      <div className="text-gray-400">
                        Suggested stake:{' '}
                        {parseFloat(vb.edge) > 10 ? '3-5%' : parseFloat(vb.edge) > 5 ? '2-3%' : '1-2%'} of bankroll
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-green-500/20">
                  <div className="text-xs text-gray-400">
                    <strong>Disclaimer:</strong> Value betting requires careful bankroll management.
                    Past performance doesn't guarantee future results. Bet responsibly.
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );

  const AnalyticsView = ({ predictions: preds, teamForm: tf, standings: st }) => {
    const getTeamStats = () => {
      const stats = {};
      preds.forEach((pred) => {
        pred.participants?.forEach((team) => {
          if (!stats[team.id]) {
            stats[team.id] = {
              name: team.name,
              matches: 0,
              avgConfidence: 0,
              winProbability: 0,
              form: tf[team.id]?.formScore || 0.5,
              position: st.find((s) => s.participant_id === team.id)?.position || 'N/A',
              points: st.find((s) => s.participant_id === team.id)?.points || 'N/A'
            };
          }
          stats[team.id].matches++;
          stats[team.id].avgConfidence += pred.prediction?.confidence || 0;
          const isHome = pred.participants[0]?.id === team.id;
          const winProb = isHome
            ? pred.prediction?.match_winner?.home || 0
            : pred.prediction?.match_winner?.away || 0;
          stats[team.id].winProbability += winProb;
        });
      });
      Object.keys(stats).forEach((teamId) => {
        const team = stats[teamId];
        team.avgConfidence = Math.round(team.avgConfidence / team.matches);
        team.winProbability = Math.round(team.winProbability / team.matches);
      });
      return Object.values(stats);
    };

    const teamStats = getTeamStats();

    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-purple-400" />
          Team Analytics Dashboard
        </h2>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <div className="text-2xl font-bold text-blue-400">{preds.length}</div>
            <div className="text-sm text-gray-400">Total Matches Analyzed</div>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <div className="text-2xl font-bold text-green-400">
              {preds.filter((p) => (p.prediction?.confidence || 0) >= 70).length}
            </div>
            <div className="text-sm text-gray-400">High Confidence Predictions</div>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <div className="text-2xl font-bold text-yellow-400">
              {preds.length
                ? Math.round(
                    preds.reduce((sum, p) => sum + (p.prediction?.confidence || 0), 0) / preds.length
                  )
                : 0}
              %
            </div>
            <div className="text-sm text-gray-400">Average Confidence</div>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <div className="text-2xl font-bold text-purple-400">{teamStats.length}</div>
            <div className="text-sm text-gray-400">Teams Analyzed</div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            Team Performance Analysis
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-600">
                  <th className="text-left p-2">Team</th>
                  <th className="text-center p-2">League Position</th>
                  <th className="text-center p-2">Points</th>
                  <th className="text-center p-2">Form Score</th>
                  <th className="text-center p-2">Avg Win Prob</th>
                  <th className="text-center p-2">Avg Confidence</th>
                  <th className="text-center p-2">Matches</th>
                </tr>
              </thead>
              <tbody>
                {teamStats
                  .sort((a, b) => (a.form || 0) < (b.form || 0) ? 1 : -1)
                  .map((team) => (
                    <tr key={team.name} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="p-2 font-medium">{team.name}</td>
                      <td className="p-2 text-center">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            Number(team.position) <= 4
                              ? 'bg-green-500/20 text-green-400'
                              : Number(team.position) <= 10
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {team.position}
                        </span>
                      </td>
                      <td className="p-2 text-center font-bold">{team.points}</td>
                      <td className="p-2 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 h-2 bg-slate-700 rounded overflow-hidden">
                            <div
                              className={`h-full rounded ${
                                (team.form || 0) > 0.6 ? 'bg-green-500' : (team.form || 0) > 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${Math.round((team.form || 0) * 100)}%` }}
                            ></div>
                          </div>
                          <span className="text-xs w-8 text-right">
                            {Math.round((team.form || 0) * 100)}%
                          </span>
                        </div>
                      </td>
                      <td className="p-2 text-center font-bold text-blue-400">{team.winProbability}%</td>
                      <td className="p-2 text-center">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            (team.avgConfidence || 0) >= 70
                              ? 'bg-green-500/20 text-green-400'
                              : (team.avgConfidence || 0) >= 50
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {team.avgConfidence}%
                        </span>
                      </td>
                      <td className="p-2 text-center text-gray-400">{team.matches}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* League distribution */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Globe className="w-5 h-5 text-green-400" />
            Match Distribution by League
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(
              preds.reduce((leagues, pred) => {
                const league = pred.league?.name || 'Unknown';
                leagues[league] = (leagues[league] || 0) + 1;
                return leagues;
              }, {})
            ).map(([leagueName, count]) => (
              <div key={leagueName} className="bg-slate-900/50 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <div className="font-medium">{leagueName}</div>
                  <div className="text-2xl font-bold text-green-400">{count}</div>
                </div>
                <div className="text-sm text-gray-400 mt-1">matches analyzed</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ---------- UI ----------
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Advanced SportMonk Prediction Bot
          </h1>
          <p className="text-gray-300 text-lg">
            Enhanced with standings, form analysis, head-to-head, and weather data
          </p>
        </div>

        {/* Controls */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 mb-8 border border-slate-700">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-2">SportMonk API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key (leave empty for demo mode)"
                className="w-full p-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex gap-2">
              <div>
                <label className="block text-sm font-medium mb-2">Date</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="p-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">League</label>
                <select
                  value={selectedLeague}
                  onChange={(e) => setSelectedLeague(e.target.value)}
                  className="p-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Leagues</option>
                  {leagues.map((league) => (
                    <option key={league.id} value={league.id}>
                      {league.name} ({league.country?.name})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-2 mb-8 border border-slate-700">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'predictions', label: 'Match Predictions', icon: Target },
              { id: 'value-bets', label: 'Value Betting', icon: TrendingUp },
              { id: 'analytics', label: 'Team Analytics', icon: BarChart3 },
              { id: 'endpoints', label: 'API Explorer', icon: Globe }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedView(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  selectedView === tab.id
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'bg-slate-700/50 text-gray-300 hover:bg-slate-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action */}
        <div className="text-center mb-8">
          <button
            onClick={generatePredictions}
            disabled={loading}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 px-8 py-3 rounded-lg font-semibold transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Analyzing Matches...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Generate Advanced Predictions
              </div>
            )}
          </button>
        </div>

        {/* Views */}
        {selectedView === 'predictions' && <PredictionsView items={predictions} />}
        {selectedView === 'value-bets' && <ValueBetsView valueBets={valueBets} />}
        {selectedView === 'analytics' && (
          <AnalyticsView predictions={predictions} teamForm={teamForm} standings={standings} />
        )}

        {/* Simple API Explorer (demo) */}
        {selectedView === 'endpoints' && (
          <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700 space-y-4">
            <h3 className="text-xl font-semibold mb-2">API Explorer (Demo)</h3>
            <div className="text-sm text-gray-300">
              Without an API key this shows static demo responses.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="font-semibold mb-2">Leagues (first 5)</div>
                <pre className="text-xs whitespace-pre-wrap">
                  {JSON.stringify((leagues || []).slice(0, 5), null, 2)}
                </pre>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="font-semibold mb-2">Fixtures (first 5)</div>
                <pre className="text-xs whitespace-pre-wrap">
                  {JSON.stringify((fixtures || []).slice(0, 5), null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SportMonkPredictionBot;