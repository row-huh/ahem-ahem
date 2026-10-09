// Private buses and coaches that a regular rider confirmed as still running (October 2026).
// Stop order: "Bus Routes Karachi", January 2010, with the rider's marks; see private-routes.json
// for the full list including routes marked as gone, changed or unchecked.
// Only names that could be tied to a place are kept. Road names ("M.A. Jinnah Road") and
// names I could not place are dropped, so each line is a thinned-out version of the list.
import { STOPS } from './stops.mjs';

const ROUTES = {
  '20': ['shireen_jinnah', 'mohatta_palace', 'do_talwar', 'clifton_bridge', 'frere_hall', 'metropole', 'lucky_star', 'empress_market', 'garden', 'old_golimar', 'bara_board', 'habib_bank', 'valika', 'site_police', 'labour_square', 'rasheedabad'],
  '4-F': ['nk_5e', 'nk_5d', 'sindhi_hotel', 'nk_11c', 'karimabad', 'liaquatabad_10', 'teen_hatti', 'jehangir_road', 'numaish', 'plaza', 'regal'],
  '4-J': ['nai_abadi_nk', 'saleem_centre', 'nagan', 'sakhi_hasan', 'hyderi', 'board_office', 'nazimabad_petrol_pump', 'liaquatabad_10', 'guru_mandir', 'tower', 'dockyard'],
  '4-L': ['maymar_mor', 'al_asif', 'sohrab_goth', 'water_pump', 'karimabad', 'liaquatabad_10', 'teen_hatti', 'numaish', 'empress_market', 'burns_road', 'tower'],
  '4-M': ['nai_abadi_nk', 'nagan', 'sakhi_hasan', 'gulberg_chowrangi', 'water_pump', 'karimabad', 'liaquatabad_10', 'teen_hatti', 'guru_mandir', 'numaish', 'taj_complex', 'empress_market', 'lucky_star', 'jinnah_hospital', 'cantt_station'],
  '7 Star': ['orangi_11_half', 'orangi_5', 'metro_cinema', 'banaras_chowk', 'habib_bank', 'nazimabad_petrol_pump', 'liaquatabad_10', 'hasan_square', 'national_stadium', 'karsaz', 'paf_base_faisal', 'colony_gate', 'malir_halt', 'kala_board', 'saudabad', 'khokhrapar'],
  '7-C': ['dockyard', 'tower', 'lee_market', 'chakiwara', 'miran_naka', 'sher_shah', 'habib_bank', 'bara_board', 'nazimabad_1', 'daak_khana', 'liaquatabad_10', 'karimabad', 'buffer_zone'],
  'A-3': ['new_sabzi_mandi', 'maskan', 'gulshan_chowrangi', 'nipa', 'hasan_square', 'gharibabad', 'liaquatabad_10', 'nazimabad_petrol_pump', 'nazimabad_1', 'nazimabad_2', 'habib_bank'],
  'D-1': ['gulshan_e_hadeed', 'quaidabad', 'malir_15', 'colony_gate', 'karsaz', 'national_stadium', 'hasan_square', 'liaquatabad_10', 'nazimabad_2', 'habib_bank', 'valika', 'metroville', 'frontier_mor', 'mominabad', 'faqir_colony', 'abidabad'],
  'D-11': ['bilal_colony', 'sharafi_goth', 'mansehra_colony', 'dawood_chowrangi', 'quaidabad', 'malir_15', 'drigh_road', 'karsaz', 'national_stadium', 'hasan_square', 'gharibabad', 'liaquatabad_10', 'nazimabad_petrol_pump', 'habib_bank', 'valika', 'labour_square', 'rasheedabad', 'saeedabad'],
  'D-7': ['majeed_colony', 'muzaffarabad_colony', 'gul_ahmed', 'dawood_chowrangi', 'quaidabad', 'malir_halt', 'natha_khan', 'drigh_road', 'millennium_mall', 'nipa', 'gulshan_chowrangi', 'sohrab_goth', 'al_asif', 'new_sabzi_mandi'],
  'F-11': ['cattle_colony', 'gul_ahmed', 'dawood_chowrangi', 'landhi_1', 'korangi_6', 'korangi_1', 'defence_mor', 'ftc', 'khalid_bin_waleed', 'jail_chowrangi', 'old_sabzi_mandi', 'hasan_square', 'nipa', 'water_pump', 'gulberg_chowrangi', 'sakhi_hasan', 'qalandaria_chowk'],
  'G-19': ['manghopir', 'kunwari_colony', 'qasba_mor', 'bacha_khan_chowk', 'valika', 'habib_bank', 'bara_board', 'golimar_chowrangi', 'liaquatabad_10', 'gharibabad', 'hasan_square', 'nipa', 'johar_mor', 'pehlwan_goth'],
  'G-7': ['gulshan_e_ghazi', 'mohajir_camp', 'sher_shah', 'gulbai', 'agra_taj', 'tower', 'bolton_market', 'jama_cloth', 'numaish', 'khudadad_colony', 'tariq_road', 'bahadurabad', 'new_town', 'old_sabzi_mandi', 'nipa', 'karachi_university', 'safoora'],
  'Gulistan': ['pehlwan_goth', 'johar_chowrangi', 'johar_mor', 'nipa', 'hasan_square', 'old_sabzi_mandi', 'new_town', 'khudadad_colony', 'numaish'],
  'Illyas': ['ittehad_town', 'saeedabad', 'sher_shah', 'gulbai', 'kharadar', 'ii_chundrigar', 'shaheen_complex', 'pidc', 'cantt_station', 'punjab_chowrangi', 'sunset_boulevard', 'kpt_interchange', 'qayyumabad', 'korangi_crossing', 'korangi_1', 'korangi_6', 'landhi_6', 'landhi_1'],
  'Imran': ['model_colony_mor', 'malir_halt', 'nursery', 'numaish', 'tower', 'gulbai', 'mauripur'],
  'Khan': ['khwaja_ajmer_nagri', 'disco_mor', 'up_mor', 'nagan', 'sakhi_hasan', 'hyderi', 'board_office', 'nazimabad_petrol_pump', 'liaquatabad_10', 'hasan_square', 'old_sabzi_mandi', 'jail_chowrangi', 'islamia_college', 'numaish', 'tower'],
  'Mashriq': ['muzaffarabad_colony', 'gul_ahmed', 'dawood_chowrangi', 'mansehra_colony', 'murtaza_chowrangi', 'singer_chowrangi', 'chamra_chowrangi', 'qayyumabad', 'kpt_interchange', 'kalapul', 'ftc', 'nursery', 'numaish', 'seventh_day'],
  'N-5': ['naval_colony', 'fareed_colony', 'orangi_10', 'orangi_5', 'metro_cinema', 'banaras_chowk', 'habib_bank', 'sher_shah', 'gulbai', 'tower', 'mt_khan_road', 'pidc', 'cantt_station', 'jinnah_hospital', 'kalapul', 'defence_mor', 'kpt_interchange', 'qayyumabad', 'chamra_chowrangi'],
  'New Afridi': ['bhains_colony_mor', 'quaidabad', 'mansehra_colony', 'murtaza_chowrangi', 'godown_chowrangi', 'qayyumabad', 'defence_mor', 'punjab_chowrangi', 'abdullah_shah_ghazi', 'shireen_jinnah', 'keamari', 'tower', 'agra_taj', 'gulbai', 'sher_shah', 'site_police', 'habib_bank', 'metroville', 'mominabad', 'faqir_colony', 'gulshan_e_ghazi'],
  'Super Hasan Zai': ['sohrab_goth', 'gulshan_chowrangi', 'nipa', 'hasan_square', 'old_sabzi_mandi', 'jail_chowrangi', 'khalid_bin_waleed', 'nursery', 'ftc', 'regent_plaza', 'jinnah_hospital', 'cantt_station', 'teen_talwar', 'do_talwar', 'abdullah_shah_ghazi'],
  'Sheraz': ['cantt_bazar', 'safoora', 'karachi_university', 'safari_park', 'nipa', 'hasan_square', 'old_sabzi_mandi', 'jail_chowrangi', 'numaish', 'plaza', 'jama_cloth', 'bolton_market', 'tower', 'kharadar', 'gulbai', 'hawksbay'],
  'X-23': ['fareed_colony', 'orangi_10', 'orangi_4', 'frontier_mor', 'habib_bank', 'nazimabad_petrol_pump', 'liaquatabad_10', 'hasan_square', 'old_sabzi_mandi', 'new_town', 'bahadurabad', 'tariq_road', 'baloch_colony', 'mehmoodabad', 'manzoor_colony', 'qayyumabad', 'chamra_chowrangi', 'bilal_colony', 'darul_uloom'],
};

// Full names as printed in the 2010 list, where the short id above drops a word.
const LISTED_AS = { '7 Star': '7 Star Flying Coach', Gulistan: 'Gulistan Coach', Illyas: 'Illyas Coach', Imran: 'Imran Coach', Khan: 'Khan Coach', Mashriq: 'Mashriq Coach', 'New Afridi': 'New Afridi Coach', 'Super Hasan Zai': 'Super Hasan Zai Coach', Sheraz: 'Sheraz Coach' };
const COLORS = ['#8d6e63', '#5d4037', '#ad1457', '#6a1b9a', '#283593', '#00695c', '#558b2f', '#9e9d24', '#ef6c00', '#4e342e', '#455a64', '#c62828'];

export const PRIVATE_LINES = Object.entries(ROUTES).map(([id, stops], i) => {
  const [a, b] = [STOPS[stops[0]], STOPS[stops[stops.length - 1]]];
  return { id, listedAs: LISTED_AS[id] || id, service: 'private', color: COLORS[i % COLORS.length], name: [`${a[0]} – ${b[0]}`, `${a[1]} – ${b[1]}`], stops };
});
