// Lines of the Sindh Mass Transit network in Karachi, as ordered stop lists.
// Spine: the route directory on https://smta.gos.pk/route-map (routes marked Active).
// Extra intermediate stops: the Karachi Bus Route Map, ref KHI-MAP-08 (01/01/2025).
// R5, R6 and R7 are listed as Inactive by SMTA and are left out.
// Every line is treated as running both ways along the same stops.
// Where SMTA's list is not in road order (R8 beyond Sher Shah, R14 around Maymar) the stops
// are ordered along the road instead; both need checking by someone who rides them.

import { PRIVATE_LINES } from './private-lines.mjs';

const FAISAL_EAST = ['malir_halt', 'colony_gate', 'natha_khan', 'drigh_road', 'paf_base_faisal', 'karsaz'];
const FAISAL_MID = ['paf_museum', 'awami_markaz', 'baloch_colony', 'fine_house', 'lal_kothi', 'nursery'];
const FAISAL_WEST = ['ftc', 'regent_plaza', 'metropole'];
const CBD = ['press_club', 'shaheen_complex', 'ii_chundrigar', 'tower'];
const NORTH = ['power_house', 'up_mor', 'nagan'];
const LIAQUATABAD_TO_TOWER = ['liaquatabad_10', 'daak_khana', 'teen_hatti', 'jehangir_road', 'guru_mandir', 'numaish', 'taj_complex', 'sindh_high_court', 'tower'];
const M9_INBOUND = ['dumba_goth', 'toll_plaza', 'new_sabzi_mandi', 'maymar_mor', 'jamali_pull', 'al_asif', 'sohrab_goth'];
const ITTEHAD = ['clock_tower_dha', 'street_26', 'masjid_ayesha', 'rahat_park', 'defence_mor'];

// km: route length published by SMTA, used only to sanity-check the drawn line.
// service: 'peoples' (red), 'pink' also runs women-only Pink Buses, 'ev', 'brt', 'dd'
const SMTA_LINES = [
  { id: 'R1', km: 31, service: 'peoples', pink: true, color: '#f58220', name: ['Khokhrapar – Dockyard', 'کھوکھراپار – ڈاکیارڈ'],
    stops: ['khokhrapar', 'saudabad', 'rcd_ground', 'kala_board', ...FAISAL_EAST, ...FAISAL_MID, ...FAISAL_WEST, ...CBD, 'ici_bridge', 'dockyard'] },
  { id: 'R2', km: 31, service: 'peoples', pink: true, color: '#b5124f', name: ['Power House – Indus Hospital', 'پاور ہاؤس – انڈس ہسپتال'],
    stops: [...NORTH, 'shafiq_mor', 'sohrab_goth', 'lucky_one', 'imtiaz_gulshan', 'gulshan_chowrangi', 'nipa', 'aladin_park', 'johar_mor', 'millennium_mall', 'cod', 'drigh_road', 'natha_khan', 'colony_gate', 'shama_center', 'shah_faisal_2', 'singer_chowrangi', 'khaddi_stop', 'korangi_5', 'nasir_jump', 'indus_hospital', 'korangi_crossing'] },
  { id: 'R3', km: 32, service: 'peoples', pink: true, color: '#22b14c', name: ['Power House – Nasir Jump', 'پاور ہاؤس – ناصر جمپ'],
    stops: [...NORTH, 'sakhi_hasan', 'five_star', 'hyderi', 'kda_chowrangi', 'board_office', 'nazimabad_petrol_pump', 'liaquatabad_10', 'essa_nagri', 'hasan_square', 'national_stadium', 'karsaz', ...FAISAL_MID, 'ftc', 'kalapul', 'sunset_boulevard', 'defence_mor', 'kpt_interchange', 'brookes_chowrangi', 'shan_chowrangi', 'nasir_jump'] },
  { id: 'R4', km: 26, service: 'peoples', color: '#2e1a87', name: ['Power House – Keamari', 'پاور ہاؤس – کیماڑی'],
    stops: [...NORTH, 'shafiq_mor', 'sohrab_goth', 'water_pump', 'ayesha_manzil', 'karimabad', ...LIAQUATABAD_TO_TOWER, 'jackson_market', 'keamari'] },
  { id: 'R8', km: 17, service: 'peoples', color: '#ef4136', name: ['Yousuf Goth – Tower', 'یوسف گوٹھ – ٹاور'],
    stops: ['yousuf_goth', 'naval_colony', 'ittehad_town', 'moach_goth', 'baldia', 'saeedabad', 'sher_shah', 'gulbai', 'agra_taj', 'ici_bridge', 'tower'] },
  { id: 'R9', km: 48, service: 'peoples', pink: true, color: '#1565c0', name: ['Gulshan-e-Hadeed – Tower', 'گلشنِ حدید – ٹاور'],
    stops: ['gulshan_e_hadeed', 'steel_mill_mor', 'port_qasim', 'razzakabad', 'abdullah_goth', 'chowkundi_mor', 'fast_university', 'bhains_colony_mor', 'manzil_pump', 'quaidabad', 'murghi_khana', 'malir_15', 'kala_board', ...FAISAL_EAST, ...FAISAL_MID, ...FAISAL_WEST, ...CBD] },
  { id: 'R10', km: 30, service: 'peoples', pink: true, color: '#e6b800', name: ['Numaish – Ibrahim Hyderi', 'نمائش – ابراہیم حیدری'],
    stops: ['numaish', 'taj_complex', 'zaibunnisa', 'zainab_market', 'metropole', 'frere_hall', 'teen_talwar', 'do_talwar', 'abdullah_shah_ghazi', 'dolmen_mall', ...ITTEHAD, 'kpt_interchange', 'korangi_crossing', 'parco', 'ibrahim_hyderi'] },
  { id: 'R11', km: 21, service: 'peoples', color: '#7b4f8e', name: ['Miran Naka – Shireen Jinnah Colony', 'میراں ناکہ – شیریں جناح کالونی'],
    stops: ['miran_naka', 'gulistan_colony', 'bihar_colony', 'agra_taj', 'daryabad', 'jinnah_bridge', 'bahria_complex_3', 'mt_khan_road', 'pidc', 'punjab_chowrangi', 'gizri', 'kh_shamsheer', 'abdullah_shah_ghazi', 'bilawal_chowrangi', 'ziauddin_clifton', 'shireen_jinnah'] },
  { id: 'R12', km: 36, service: 'peoples', color: '#9c1fa8', name: ['Naddi Kinara – Lucky Star', 'ندی کنارہ – لکی اسٹار'],
    stops: ['naddi_kinara', 'khokhrapar', 'saudabad', 'rcd_ground', 'kala_board', 'malir_15', 'murghi_khana', 'quaidabad', 'dawood_chowrangi', 'chowrangi_89', 'babar_market', 'landhi_36', 'korangi_33', 'gulzar_colony', 'indus_hospital', 'korangi_crossing', 'qayyumabad', 'kpt_interchange', 'kalapul', 'ftc', 'lucky_star'] },
  { id: 'R13', km: 19, service: 'peoples', color: '#6d1b1b', name: ['Hawks Bay – Tower', 'ہاکس بے – ٹاور'],
    stops: ['hawksbay', 'masroor_base', 'mauripur', 'truck_adda', 'gulbai', 'agra_taj', 'ici_bridge', 'tower'] },
  { id: 'R14', km: 29, service: 'peoples', color: '#00897b', name: ['Maymar – Tower', 'معمار – ٹاور'],
    stops: ['nawaz_sharif_park', 'maymar_ext', 'ahsanabad', 'maymar_mor', 'jamali_pull', 'al_asif', 'sohrab_goth', 'water_pump', 'ayesha_manzil', 'karimabad', ...LIAQUATABAD_TO_TOWER] },
  { id: 'DD01', km: 24, service: 'dd', color: '#c2185b', name: ['Model Colony – Tower (Double Decker)', 'ماڈل کالونی – ٹاور (ڈبل ڈیکر)'],
    stops: ['model_colony_phatak', 'model_colony_mor', ...FAISAL_EAST, ...FAISAL_MID, ...FAISAL_WEST, ...CBD] },
  { id: 'EV1', km: 41, service: 'ev', color: '#111111', name: ['CMH Malir Cantt – Dolmen Mall Clifton', 'سی ایم ایچ ملیر کینٹ – ڈولمین مال کلفٹن'],
    stops: ['cmh_malir', 'cantt_bazar', 'check_post_2', 'tank_chowk', 'model_colony_mor', 'security_printing', ...FAISAL_EAST, ...FAISAL_MID, 'ftc', 'kalapul', 'sunset_boulevard', ...ITTEHAD.slice().reverse(), 'dolmen_mall'] },
  { id: 'EV2', km: 44, service: 'ev', color: '#1e9bb3', name: ['Bahria Town – Malir Halt', 'بحریہ ٹاؤن – ملیر ہالٹ'],
    stops: ['bahria_town', 'dumba_goth', 'toll_plaza', 'baqai_university', 'check_post_5', 'check_post_6', 'tank_chowk', 'model_colony_mor', 'security_printing', 'malir_halt'] },
  { id: 'EV3', km: 23, service: 'ev', color: '#6b4a12', name: ['Malir Cantt – Numaish', 'ملیر کینٹ – نمائش'],
    stops: ['askari_5', 'check_post_5', 'safoora', 'mausamiyat', 'kamran_chowrangi', 'johar_chowrangi', 'johar_mor', 'millennium_mall', 'national_stadium', 'aga_khan', 'liaquat_national', 'new_town', 'islamia_college', 'numaish'] },
  { id: 'EV4', km: 58, service: 'ev', color: '#ec1e8f', name: ['Bahria Town – Ayesha Manzil', 'بحریہ ٹاؤن – عائشہ منزل'],
    stops: ['bahria_town', ...M9_INBOUND, 'water_pump', 'ayesha_manzil'] },
  { id: 'EV5', km: 48, service: 'ev', color: '#b8960c', name: ['DHA City – Sohrab Goth', 'ڈی ایچ اے سٹی – سہراب گوٹھ'],
    stops: ['dha_city', 'kathore', 'bahria_town', ...M9_INBOUND] },
  { id: 'GL', service: 'brt', color: '#1b7a2f', name: ['Green Line BRT', 'گرین لائن بی آر ٹی'],
    stops: ['abdullah_chowk', 'surjani_kda', 'karimi_chowrangi', 'four_k_chowrangi', 'do_minute', 'aisha_complex', 'power_house', 'up_mor', 'nagan', 'erum_shopping', 'sakhi_hasan', 'five_star', 'hyderi', 'kda_chowrangi', 'board_office', 'nazimabad_7', 'nazimabad_6', 'model_park', 'nazimabad_1', 'lasbela', 'guru_mandir', 'numaish'] },
  { id: 'OL', service: 'brt', color: '#f47b20', name: ['Orange Line BRT', 'اورنج لائن بی آر ٹی'],
    stops: ['orangi_nadra', 'orangi_police', 'abdullah_college', 'board_office'] },
];

// 'private': privately run buses and coaches, see private-lines.mjs
export const LINES = [...SMTA_LINES, ...PRIVATE_LINES];

// Fares as last reported in the press. They are shown as "about", never as a promise.
export const FARES = {
  peoples: { type: 'distance', bands: [[15, 80], [Infinity, 120]], asOf: '2025' },
  dd: { type: 'distance', bands: [[15, 80], [Infinity, 120]], asOf: '2025' },
  ev: { type: 'unknown' },
  brt: { type: 'unknown' },
  private: { type: 'unknown' },
};
