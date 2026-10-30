import { Playlist, Track, TrackSource } from '../types/music';
import { parseLRC } from '../utils/lrcParser';

export const SEED_TRACKS: Track[] = [
  {
    id: 'track-bolen',
    title: 'Болен',
    artist: 'dope17, mapt0v',
    album: 'Тёмный архив',
    duration: 22,
    audioUrl: '/audio/track-1.wav',
    coverUrl: '/covers/cover-1.svg',
    explicit: true,
    bpm: 97,
    bpmRange: [62, 97],
    source: TrackSource.BUILTIN,
    isFavorite: true,
    isOfflineCached: false,
    accentGlow: 'rgba(228, 228, 235, 0.16)',
    addedAt: 1730000001000,
    lyrics: parseLRC(
      `[00:00.20] Холодный город спит во мгле
[00:01.90] Она спасёт меня
[00:03.40] Она снова зароллит в меч
[00:08.40] Та тень из средневековья
[00:12.80] Я заболел этими снами
[00:16.80] Сквозь пепел серых этажей
[00:19.80] Останься светом в тишине`,
      22
    ),
  },
  {
    id: 'track-night-prospekt',
    title: 'Ночной проспект',
    artist: 'KinoSynth, Север',
    album: 'Линии метро',
    duration: 26,
    audioUrl: '/audio/track-2.wav',
    coverUrl: '/covers/cover-2.svg',
    explicit: false,
    bpm: 124,
    bpmRange: [88, 128],
    source: TrackSource.SPOTIFY,
    externalUrl: 'https://open.spotify.com',
    isFavorite: true,
    isOfflineCached: false,
    accentGlow: 'rgba(147, 197, 253, 0.16)',
    addedAt: 1730000002000,
    lyrics: parseLRC(
      `[00:00.50] Фонари рисуют полосы на мокром стекле
[00:04.50] Мы летим по пустому кольцу налегке
[00:08.80] Радио ловит забытый мотив
[00:13.20] Город дышит глубоко в объектив
[00:17.80] Никаких звонков до самого утра
[00:22.00] Только скорость и тёплый неон двора`,
      26
    ),
  },
  {
    id: 'track-eclipse',
    title: 'Затмение 404',
    artist: 'Vektor Noir',
    album: 'Синтетика',
    duration: 24,
    audioUrl: '/audio/track-3.wav',
    coverUrl: '/covers/cover-3.svg',
    explicit: true,
    bpm: 110,
    bpmRange: [76, 114],
    source: TrackSource.SOUNDCLOUD,
    externalUrl: 'https://soundcloud.com',
    isFavorite: false,
    isOfflineCached: false,
    accentGlow: 'rgba(216, 180, 254, 0.15)',
    addedAt: 1730000003000,
    lyrics: parseLRC(
      `[00:00.50] Низкий бас качает бетонный зал
[00:04.20] Ты искала сигнал среди зеркал
[00:08.40] Частота уходит за горизонт
[00:12.60] Каждый такт ускоряет пульс и фронт
[00:16.80] Отпусти контроль и закрой глаза
[00:20.40] Начинается тихая полоса`,
      24
    ),
  },
  {
    id: 'track-rain-tape',
    title: 'Дождь на кассете',
    artist: 'Апрель, lo-fi коллектив',
    album: 'Утренний пар',
    duration: 25,
    audioUrl: '/audio/track-4.wav',
    coverUrl: '/covers/cover-4.svg',
    explicit: false,
    bpm: 86,
    bpmRange: [60, 88],
    source: TrackSource.BUILTIN,
    isFavorite: false,
    isOfflineCached: false,
    accentGlow: 'rgba(153, 246, 228, 0.14)',
    addedAt: 1730000004000,
    lyrics: parseLRC(
      `[00:00.60] Шорох плёнки и капли по карнизу
[00:04.80] Первый кофе остывает внизу
[00:09.20] Никуда не надо спешить сейчас
[00:13.80] Мягкий аккорд собирает нас
[00:18.50] Тихий рассвет сквозь облака
[00:22.00] Чистая белая полоса листа`,
      25
    ),
  },
  {
    id: 'track-autobahn',
    title: 'Турбонаддув',
    artist: 'PHONKLAB, mapt0v',
    album: 'Ночная смена',
    duration: 24,
    audioUrl: '/audio/track-5.wav',
    coverUrl: '/covers/cover-5.svg',
    explicit: true,
    bpm: 132,
    bpmRange: [95, 136],
    source: TrackSource.SOUNDCLOUD,
    externalUrl: 'https://soundcloud.com',
    isFavorite: true,
    isOfflineCached: false,
    accentGlow: 'rgba(253, 186, 116, 0.14)',
    addedAt: 1730000005000,
    lyrics: parseLRC(
      `[00:00.40] Стрелка тахометра бьётся в предел
[00:04.00] Это тот звук, что ты так хотел
[00:08.00] Фары режут густой туман
[00:12.00] Ночной маршрут как киноэкран
[00:16.20] Переключай передачу вверх
[00:20.00] Оставляя позади весь свет`,
      24
    ),
  },
  {
    id: 'track-monolith',
    title: 'Тишина панелек',
    artist: 'Этажи, Эхо',
    album: 'Архитектура сна',
    duration: 28,
    audioUrl: '/audio/track-6.wav',
    coverUrl: '/covers/cover-6.svg',
    explicit: false,
    bpm: 92,
    bpmRange: [64, 96],
    source: TrackSource.CLOUD,
    isFavorite: false,
    isOfflineCached: false,
    accentGlow: 'rgba(212, 212, 216, 0.15)',
    addedAt: 1730000006000,
    lyrics: parseLRC(
      `[00:00.60] В жёлтых окнах зажигается чай
[00:05.20] Если устал — просто помолчи и слушай
[00:10.00] Двор укрыт серебристой росой
[00:14.80] Возвращаемся медленно домой
[00:19.60] Сотни историй за каждой стеной
[00:24.00] Музыка греет лучше любой весной`,
      28
    ),
  },
];

export const SEED_PLAYLISTS: Playlist[] = [
  {
    id: 'pl-all',
    name: 'Вся медиатека',
    description: 'Все треки библиотеки плеера',
    trackIds: [
      'track-bolen',
      'track-night-prospekt',
      'track-eclipse',
      'track-rain-tape',
      'track-autobahn',
      'track-monolith',
    ],
    isSystem: true,
    createdAt: 1730000000000,
  },
  {
    id: 'pl-night-drive',
    name: 'Ночной драйв',
    description: 'Глубокий бас, пост-панк и ночная атмосфера',
    trackIds: ['track-bolen', 'track-night-prospekt', 'track-autobahn', 'track-eclipse'],
    createdAt: 1730000001000,
  },
];

