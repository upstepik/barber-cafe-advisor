import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Camera,
  Check,
  ClipboardList,
  Clock3,
  RotateCcw,
  Scissors,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UserRoundCheck,
  X,
  ZoomIn,
} from 'lucide-react';
import './styles.css';

const faceShapes = ['oval', 'round', 'square', 'long'];
const beardStates = ['none', 'stubble', 'short_beard', 'full_beard'];
const imageAngles = ['front', 'left-profile', 'right-profile'];
const scanConfidenceThreshold = 0.65;
const scannerDerivedFields = ['topLength', 'currentSides', 'faceShape', 'hairType', 'beard'];
const profileAutoCaptureDelayMs = 5000;
const scanPhotoSteps = [
  { id: 'front', label: 'Анфас', target: 'front', hint: 'Смотри прямо в камеру. Нейтральное лицо, лицо полностью в кадре.', capture: 'user' },
  { id: 'rightProfile', label: 'Правый профиль', target: 'right', hint: 'Поверни голову вправо. Должны быть видны линия челюсти, волосы и борода.', capture: 'environment' },
  { id: 'leftProfile', label: 'Левый профиль', target: 'left', hint: 'Поверни голову влево. Желательно та же дистанция и тот же свет.', capture: 'environment' },
];
const scannerFrameTargets = {
  front: { width: 0.34, height: 0.44, holdFrames: 22, yaw: 0, yawTolerance: 0.1, minQuality: 0.58 },
  right: { width: 0.27, height: 0.4, holdFrames: 18, yaw: -0.58, yawTolerance: 0.24, minQuality: 0.52 },
  left: { width: 0.27, height: 0.4, holdFrames: 18, yaw: 0.58, yawTolerance: 0.24, minQuality: 0.52 },
};
const boneMassOptions = [
  { value: 'light', label: 'Легкая', hint: 'Более мягкая костная структура, меньше визуального веса в челюсти и скулах.' },
  { value: 'medium', label: 'Средняя', hint: 'Сбалансированная структура головы, челюсти и скул.' },
  { value: 'strong', label: 'Выраженная', hint: 'Более сильная челюсть, выраженные скулы, тяжелее визуальный силуэт.' },
  { value: 'unknown', label: 'Не определено', hint: 'Оставь нейтрально, если по фото это неочевидно.' },
];

const imageSet = (slug) =>
  faceShapes.reduce((acc, shape) => {
    acc[shape] = beardStates.reduce((stateAcc, beard) => {
      stateAcc[beard] = imageAngles.reduce(
        (angleAcc, angle) => ({
          ...angleAcc,
          [angle]: `/assets/haircuts/${shape}/${beard}/${angle}/${slug}.png`,
        }),
        { legacy: `/assets/haircuts/${shape}/${beard}/${slug}.png` },
      );
      return stateAcc;
    }, {});
    return acc;
  }, {});

const questions = [
  {
    id: 'topLength',
    eyebrow: '01 / длина',
    title: 'Что сейчас по длине сверху?',
    helper: 'Не предлагаем форму, которую сегодня физически нельзя сделать без отращивания.',
    options: [
      { value: 'very_short', label: 'Очень коротко', hint: 'Почти buzz, сверху до 1-2 см.' },
      { value: 'short', label: 'Коротко', hint: 'Есть база под crop, taper или crew cut.' },
      { value: 'medium', label: 'Средне', hint: 'Можно делать текстуру, пробор, quiff.' },
      { value: 'long', label: 'Длинно', hint: 'Можно сохранить длину или мягко обновить форму.' },
    ],
  },
  {
    id: 'currentSides',
    eyebrow: '02 / бока',
    title: 'Что сейчас по бокам?',
    helper: 'Это влияет на то, можно ли делать fade прямо сейчас или лучше идти мягче.',
    options: [
      { value: 'fresh_short', label: 'Уже коротко', hint: 'Можно поддержать fade или taper.' },
      { value: 'grown', label: 'Заросло', hint: 'Есть место для заметного обновления.' },
      { value: 'natural', label: 'Нормально', hint: 'Можно оставить более мягкий силуэт.' },
      { value: 'unknown', label: 'Не знаю', hint: 'Система выберет более безопасные варианты.' },
    ],
  },
  {
    id: 'changeLevel',
    eyebrow: '03 / перемены',
    title: 'Насколько сильно меняемся?',
    helper: 'Так проще выбрать уровень риска, чем сразу угадывать название стрижки.',
    options: [
      { value: 'safe', label: 'Аккуратно', hint: 'Освежить образ без резкой смены.' },
      { value: 'noticeable', label: 'Заметно', hint: 'Хочу выглядеть свежее и современнее.' },
      { value: 'bold', label: 'Можно смело', hint: 'Готов к более сильной форме и коротким бокам.' },
    ],
  },
  {
    id: 'faceShape',
    eyebrow: '04 / лицо',
    title: 'Какая форма лица ближе?',
    helper: 'Сканер обычно подскажет это сам, но здесь можно поправить вручную.',
    options: [
      { value: 'oval', label: 'Овальное', hint: 'Самая гибкая форма для большинства стрижек.' },
      { value: 'round', label: 'Круглое', hint: 'Обычно лучше добавить высоту и убрать лишний объем по бокам.' },
      { value: 'square', label: 'Квадратное', hint: 'Хорошо держит более четкие формы.' },
      { value: 'long', label: 'Вытянутое', hint: 'Лучше не перегружать верх и держать баланс.' },
      { value: 'unknown', label: 'Не знаю', hint: 'Покажем более универсальные варианты.' },
    ],
  },
  {
    id: 'hairType',
    eyebrow: '05 / волосы',
    title: 'Какие волосы?',
    helper: 'Одна и та же форма по-разному живет на тонких, густых и волнистых волосах.',
    options: [
      { value: 'thin', label: 'Тонкие', hint: 'Лучше формы без тяжелой лишней массы.' },
      { value: 'normal', label: 'Обычные', hint: 'Открыто большинство базовых вариантов.' },
      { value: 'thick', label: 'Густые', hint: 'Можно текстуру, объем и более плотную форму.' },
      { value: 'wavy', label: 'Волнистые', hint: 'Лучше использовать естественное движение волос.' },
    ],
  },
  {
    id: 'styling',
    eyebrow: '06 / укладка',
    title: 'Сколько готов укладываться?',
    helper: 'Референс должен жить не только в кресле, но и каждый день после душа.',
    options: [
      { value: 'none', label: '0 минут', hint: 'Встал и пошел.' },
      { value: 'low', label: '3-5 минут', hint: 'Немного пасты, пудры или руками поправить.' },
      { value: 'medium', label: '10 минут', hint: 'Фен, форма и осознанный стайлинг.' },
    ],
  },
  {
    id: 'sidePreference',
    eyebrow: '07 / fade',
    title: 'Что можно делать по бокам?',
    helper: 'Если человек не хочет коротко, слишком агрессивные fade мы не показываем.',
    options: [
      { value: 'no_short', label: 'Не коротко', hint: 'Оставить спокойный натуральный край.' },
      { value: 'soft_taper', label: 'Мягкий taper', hint: 'Чисто, но без резкого контраста.' },
      { value: 'fade', label: 'Fade можно', hint: 'Можно заметный переход.' },
      { value: 'very_short', label: 'Можно очень коротко', hint: 'Buzz, skin fade и более резкая форма.' },
    ],
  },
  {
    id: 'beard',
    eyebrow: '08 / борода',
    title: 'Что сейчас с бородой?',
    helper: 'Фото и рекомендации должны совпадать с реальным состоянием лица.',
    options: [
      { value: 'none', label: 'Без бороды', hint: 'Фокус только на волосах и форме лица.' },
      { value: 'stubble', label: 'Щетина', hint: 'Легкая графика без полноценной бороды.' },
      { value: 'short_beard', label: 'Короткая борода', hint: 'Важно, как связаны виски и борода.' },
      { value: 'full_beard', label: 'Полная борода', hint: 'Стрижка должна балансировать нижнюю часть лица.' },
    ],
  },
  {
    id: 'style',
    eyebrow: '09 / вайб',
    title: 'Какой эффект нужен?',
    helper: 'Финальный слой: выбираем не название, а ощущение от образа.',
    options: [
      { value: 'clean', label: 'Аккуратно', hint: 'Свежо, чисто, без лишнего эксперимента.' },
      { value: 'street', label: 'Молодежно', hint: 'Текстура, движение, более заметный силуэт.' },
      { value: 'business', label: 'Сдержанно', hint: 'Спокойно, взрослее, подходит под работу.' },
      { value: 'bold', label: 'Смелее', hint: 'Хочу, чтобы изменение было явно видно.' },
    ],
  },
];

const haircuts = [
  {
    id: 'low-taper',
    name: 'Low Taper',
    role: 'Р›СѓС‡С€РёР№ safe-РІР°СЂРёР°РЅС‚',
    images: imageSet('low-taper'),
    allowed: {
      topLength: ['very_short', 'short', 'medium'],
      sidePreference: ['soft_taper', 'fade', 'very_short'],
      styling: ['none', 'low', 'medium'],
      beard: ['none', 'stubble', 'short_beard', 'full_beard'],
    },
    scores: {
      faceShape: { oval: 3, round: 2, square: 3, long: 2, unknown: 2 },
      hairType: { thin: 2, normal: 3, thick: 3, wavy: 2 },
      changeLevel: { safe: 4, noticeable: 2, bold: 1 },
      style: { clean: 4, business: 3, street: 2, bold: 1 },
      currentSides: { fresh_short: 3, grown: 2, natural: 2, unknown: 2 },
    },
    clientWhy: 'РЎР°РјС‹Р№ Р±РµР·РѕРїР°СЃРЅС‹Р№ СЃРїРѕСЃРѕР± РІС‹РіР»СЏРґРµС‚СЊ СЃРІРµР¶РµРµ: С‡РёСЃС‚С‹Рµ РІРёСЃРєРё, РЅР°С‚СѓСЂР°Р»СЊРЅС‹Р№ РІРµСЂС…, Р±РµР· СЂРµР·РєРѕР№ СЃРјРµРЅС‹ РѕР±СЂР°Р·Р°.',
    barberNote: 'РќРёР·РєРёР№ taper РЅР° РІРёСЃРєР°С… Рё Р·Р°С‚С‹Р»РєРµ, СЃРІРµСЂС…Сѓ СЃРѕС…СЂР°РЅРёС‚СЊ РЅР°С‚СѓСЂР°Р»СЊРЅСѓСЋ С„РѕСЂРјСѓ. РћРєР°РЅС‚РѕРІРєСѓ СЃРґРµР»Р°С‚СЊ С‡РёСЃС‚РѕР№, РЅРѕ РЅРµ Р°РіСЂРµСЃСЃРёРІРЅРѕР№.',
    upkeep: '0-3 РјРёРЅСѓС‚С‹',
  },
  {
    id: 'textured-crop',
    name: 'Textured Crop',
    role: 'РњРѕР»РѕРґРµР¶РЅС‹Р№ clean',
    images: imageSet('textured-crop'),
    allowed: {
      topLength: ['short', 'medium'],
      sidePreference: ['soft_taper', 'fade', 'very_short'],
      styling: ['none', 'low'],
      beard: ['none', 'stubble', 'short_beard', 'full_beard'],
    },
    scores: {
      faceShape: { oval: 3, round: 4, square: 4, long: -2, unknown: 2 },
      hairType: { thin: 1, normal: 3, thick: 4, wavy: 3 },
      changeLevel: { safe: 2, noticeable: 4, bold: 3 },
      style: { clean: 3, business: 1, street: 4, bold: 2 },
      currentSides: { fresh_short: 2, grown: 3, natural: 2, unknown: 2 },
    },
    clientWhy: 'РЈР±РёСЂР°РµС‚ Р»РёС€РЅРёР№ РѕР±СЉРµРј РїРѕ Р±РѕРєР°Рј Рё РґР°РµС‚ С„РѕСЂРјСѓ Р±РµР· СЃР»РѕР¶РЅРѕР№ РµР¶РµРґРЅРµРІРЅРѕР№ СѓРєР»Р°РґРєРё.',
    barberNote: 'Р’РµСЂС… 3-5 СЃРј, С‚РµРєСЃС‚СѓСЂР° РЅРѕР¶РЅРёС†Р°РјРё, low/mid fade РёР»Рё РјСЏРіРєРёР№ taper. Р§РµР»РєСѓ РЅРµ СѓС‚СЏР¶РµР»СЏС‚СЊ.',
    upkeep: '3-5 РјРёРЅСѓС‚',
  },
  {
    id: 'french-crop',
    name: 'French Crop',
    role: 'Р‘РµР· СѓРєР»Р°РґРєРё',
    images: imageSet('french-crop'),
    allowed: {
      topLength: ['very_short', 'short', 'medium'],
      sidePreference: ['soft_taper', 'fade', 'very_short'],
      styling: ['none', 'low'],
      beard: ['none', 'stubble', 'short_beard', 'full_beard'],
    },
    scores: {
      faceShape: { oval: 3, round: 4, square: 3, long: -1, unknown: 2 },
      hairType: { thin: 2, normal: 3, thick: 4, wavy: 2 },
      changeLevel: { safe: 2, noticeable: 4, bold: 2 },
      style: { clean: 3, business: 1, street: 4, bold: 2 },
      currentSides: { fresh_short: 2, grown: 3, natural: 1, unknown: 2 },
    },
    clientWhy: 'РљРѕСЂРѕС‚РєР°СЏ С‚РµРєСЃС‚СѓСЂР° РІС‹РіР»СЏРґРёС‚ СЃРѕРІСЂРµРјРµРЅРЅРѕ Рё РЅРµ С‚СЂРµР±СѓРµС‚ С„РµРЅР° РєР°Р¶РґС‹Р№ РґРµРЅСЊ.',
    barberNote: 'РљРѕСЂРѕС‚РєР°СЏ С‚РµРєСЃС‚СѓСЂРЅР°СЏ С‡РµР»РєР°, РІРµСЂС… С„РёР»РёСЂРѕРІР°С‚СЊ Р°РєРєСѓСЂР°С‚РЅРѕ, fade РІС‹Р±СЂР°С‚СЊ РїРѕ С„РѕСЂРјРµ РіРѕР»РѕРІС‹.',
    upkeep: '0-5 РјРёРЅСѓС‚',
  },
  {
    id: 'crew-cut',
    name: 'Crew Cut',
    role: 'РџСЂР°РєС‚РёС‡РЅС‹Р№ РІР°СЂРёР°РЅС‚',
    images: imageSet('crew-cut'),
    allowed: {
      topLength: ['very_short', 'short'],
      sidePreference: ['fade', 'very_short', 'soft_taper'],
      styling: ['none', 'low'],
      beard: ['none', 'stubble', 'short_beard'],
    },
    scores: {
      faceShape: { oval: 3, round: 2, square: 4, long: 0, unknown: 2 },
      hairType: { thin: 3, normal: 3, thick: 3, wavy: 1 },
      changeLevel: { safe: 2, noticeable: 3, bold: 3 },
      style: { clean: 4, business: 3, street: 2, bold: 2 },
      currentSides: { fresh_short: 3, grown: 2, natural: 1, unknown: 2 },
    },
    clientWhy: 'Р§РёСЃС‚С‹Р№ РєРѕСЂРѕС‚РєРёР№ СЃРёР»СѓСЌС‚, РєРѕС‚РѕСЂС‹Р№ Р»РµРіРєРѕ РЅРѕСЃРёС‚СЊ Р±РµР· СЃС‚Р°Р№Р»РёРЅРіР°.',
    barberNote: 'Р’РµСЂС… РѕСЃС‚Р°РІРёС‚СЊ РЅРµРјРЅРѕРіРѕ РґР»РёРЅРЅРµРµ Р±РѕРєРѕРІ, РїРµСЂРµС…РѕРґ РґРµСЂР¶Р°С‚СЊ РЅРёР·РєРѕ РёР»Рё СЃСЂРµРґРЅРµ, РЅРµ РґРµР»Р°С‚СЊ РїР»РѕСЃРєСѓСЋ РјР°РєСѓС€РєСѓ.',
    upkeep: '0 РјРёРЅСѓС‚',
  },
  {
    id: 'buzz-fade',
    name: 'Buzz Fade',
    role: 'РЎР°РјС‹Р№ РїСЂРѕСЃС‚РѕР№ СѓС…РѕРґ',
    images: imageSet('buzz-fade'),
    allowed: {
      topLength: ['very_short', 'short'],
      sidePreference: ['very_short', 'fade'],
      styling: ['none'],
      beard: ['none', 'stubble', 'short_beard'],
    },
    scores: {
      faceShape: { oval: 3, round: 1, square: 4, long: -2, unknown: 1 },
      hairType: { thin: 3, normal: 3, thick: 3, wavy: 1 },
      changeLevel: { safe: -1, noticeable: 2, bold: 5 },
      style: { clean: 2, business: 1, street: 3, bold: 5 },
      currentSides: { fresh_short: 3, grown: 2, natural: 0, unknown: 1 },
    },
    clientWhy: 'РќРѕР»СЊ СѓРєР»Р°РґРєРё Рё СЂРµР·РєРѕРµ РѕС‰СѓС‰РµРЅРёРµ СЃРІРµР¶РµСЃС‚Рё, РµСЃР»Рё РєР»РёРµРЅС‚ РіРѕС‚РѕРІ Рє РєРѕСЂРѕС‚РєРѕР№ С„РѕСЂРјРµ.',
    barberNote: 'Р’РµСЂС… 6-12 РјРј РїРѕ С„РѕСЂРјРµ РіРѕР»РѕРІС‹, fade РЅРµ Р·Р°РґРёСЂР°С‚СЊ СЃР»РёС€РєРѕРј РІС‹СЃРѕРєРѕ, РѕРєР°РЅС‚РѕРІРєСѓ РґРµСЂР¶Р°С‚СЊ С‡РёСЃС‚РѕР№.',
    upkeep: '0 РјРёРЅСѓС‚',
  },
  {
    id: 'classic-scissor',
    name: 'Classic Scissor Cut',
    role: 'РЎРїРѕРєРѕР№РЅР°СЏ РєР»Р°СЃСЃРёРєР°',
    images: imageSet('classic-scissor'),
    allowed: {
      topLength: ['medium', 'long'],
      sidePreference: ['no_short', 'soft_taper'],
      styling: ['none', 'low', 'medium'],
      beard: ['none', 'stubble', 'short_beard', 'full_beard'],
    },
    scores: {
      faceShape: { oval: 4, round: 1, square: 3, long: 3, unknown: 3 },
      hairType: { thin: 2, normal: 3, thick: 3, wavy: 3 },
      changeLevel: { safe: 4, noticeable: 2, bold: -1 },
      style: { clean: 3, business: 4, street: 1, bold: -1 },
      currentSides: { fresh_short: 1, grown: 3, natural: 4, unknown: 2 },
    },
    clientWhy: 'РќРµ РІС‹РіР»СЏРґРёС‚ РєР°Рє СЂРµР·РєР°СЏ СЃРјРµРЅР° РёРјРёРґР¶Р°, РЅРѕ РґРµР»Р°РµС‚ С„РѕСЂРјСѓ РґРѕСЂРѕР¶Рµ Рё Р°РєРєСѓСЂР°С‚РЅРµРµ.',
    barberNote: 'Р Р°Р±РѕС‚Р° РЅРѕР¶РЅРёС†Р°РјРё, РЅР°С‚СѓСЂР°Р»СЊРЅС‹Рµ РІРёСЃРєРё, СѓР±СЂР°С‚СЊ РѕР±СЉРµРј РІ Р·РѕРЅРµ РјР°РєСѓС€РєРё, РѕСЃС‚Р°РІРёС‚СЊ РґРІРёР¶РµРЅРёРµ РІРѕР»РѕСЃ.',
    upkeep: '3-5 РјРёРЅСѓС‚',
  },
  {
    id: 'modern-side-part',
    name: 'Modern Side Part',
    role: 'Business-РІР°СЂРёР°РЅС‚',
    images: imageSet('modern-side-part'),
    allowed: {
      topLength: ['medium', 'long'],
      sidePreference: ['no_short', 'soft_taper', 'fade'],
      styling: ['low', 'medium'],
      beard: ['none', 'stubble', 'short_beard', 'full_beard'],
    },
    scores: {
      faceShape: { oval: 4, round: 1, square: 4, long: 2, unknown: 2 },
      hairType: { thin: 1, normal: 3, thick: 3, wavy: 2 },
      changeLevel: { safe: 3, noticeable: 3, bold: 0 },
      style: { clean: 3, business: 5, street: 0, bold: 0 },
      currentSides: { fresh_short: 2, grown: 3, natural: 3, unknown: 2 },
    },
    clientWhy: 'РЎРѕР±СЂР°РЅРЅС‹Р№ РІР·СЂРѕСЃР»С‹Р№ РѕР±СЂР°Р·, РєРѕС‚РѕСЂС‹Р№ С…РѕСЂРѕС€Рѕ СЂР°Р±РѕС‚Р°РµС‚ СЃ РѕС„РёСЃРЅС‹Рј СЃС‚РёР»РµРј Рё Р±РѕСЂРѕРґРѕР№.',
    barberNote: 'РЎРѕС…СЂР°РЅРёС‚СЊ РґР»РёРЅСѓ СЃРІРµСЂС…Сѓ, РјСЏРіРєРёР№ РїСЂРѕР±РѕСЂ, СѓР±СЂР°С‚СЊ РјР°СЃСЃСѓ РїРѕ Р±РѕРєР°Рј, Р±РѕСЂРѕРґСѓ РІС‹СЂРѕРІРЅСЏС‚СЊ РїРѕ С‡РµР»СЋСЃС‚Рё.',
    upkeep: '5-10 РјРёРЅСѓС‚',
  },
  {
    id: 'ivy-league',
    name: 'Ivy League',
    role: 'Clean business',
    images: imageSet('ivy-league'),
    allowed: {
      topLength: ['short', 'medium'],
      sidePreference: ['soft_taper', 'fade'],
      styling: ['low', 'medium'],
      beard: ['none', 'stubble', 'short_beard'],
    },
    scores: {
      faceShape: { oval: 4, round: 2, square: 4, long: 1, unknown: 2 },
      hairType: { thin: 2, normal: 3, thick: 3, wavy: 1 },
      changeLevel: { safe: 4, noticeable: 2, bold: 0 },
      style: { clean: 4, business: 5, street: 0, bold: 0 },
      currentSides: { fresh_short: 3, grown: 2, natural: 2, unknown: 2 },
    },
    clientWhy: 'РљРѕСЂРѕС‚РєРѕ, Р°РєРєСѓСЂР°С‚РЅРѕ, РЅРѕ РЅРµ СЃРєСѓС‡РЅРѕ. РҐРѕСЂРѕС€РёР№ РІС‹Р±РѕСЂ, РµСЃР»Рё С…РѕС‡РµС‚СЃСЏ РІС‹РіР»СЏРґРµС‚СЊ РІР·СЂРѕСЃР»РµРµ.',
    barberNote: 'Р’РµСЂС… РѕСЃС‚Р°РІРёС‚СЊ РґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РґР»РёРЅРЅС‹Рј РґР»СЏ Р»РµРіРєРѕРіРѕ РЅР°РїСЂР°РІР»РµРЅРёСЏ, РІРёСЃРєРё РјСЏРіРєРѕ РїРѕС‡РёСЃС‚РёС‚СЊ taper/fade.',
    upkeep: '3-5 РјРёРЅСѓС‚',
  },
  {
    id: 'messy-fringe',
    name: 'Messy Fringe',
    role: 'Street-РІР°СЂРёР°РЅС‚',
    images: imageSet('messy-fringe'),
    allowed: {
      topLength: ['medium', 'long'],
      sidePreference: ['soft_taper', 'fade', 'no_short'],
      styling: ['low', 'medium'],
      beard: ['none', 'stubble', 'short_beard'],
    },
    scores: {
      faceShape: { oval: 3, round: 2, square: 2, long: 3, unknown: 2 },
      hairType: { thin: 0, normal: 3, thick: 4, wavy: 4 },
      changeLevel: { safe: 0, noticeable: 4, bold: 3 },
      style: { clean: 1, business: -1, street: 5, bold: 3 },
      currentSides: { fresh_short: 2, grown: 3, natural: 2, unknown: 2 },
    },
    clientWhy: 'Р”Р°РµС‚ РјРѕР»РѕРґСѓСЋ С‚РµРєСЃС‚СѓСЂСѓ Рё РґРІРёР¶РµРЅРёРµ, РµСЃР»Рё РІРѕР»РѕСЃС‹ РїРѕР·РІРѕР»СЏСЋС‚ РґРµСЂР¶Р°С‚СЊ С„РѕСЂРјСѓ.',
    barberNote: 'РћСЃС‚Р°РІРёС‚СЊ РґРІРёР¶РµРЅРёРµ СЃРїРµСЂРµРґРё, СЃРЅСЏС‚СЊ РјР°СЃСЃСѓ РїРѕ Р±РѕРєР°Рј, С‚РµРєСЃС‚СѓСЂСѓ РґРµР»Р°С‚СЊ РјСЏРіРєРѕ, Р±РµР· С‚СЏР¶РµР»РѕР№ С‡РµР»РєРё.',
    upkeep: '3-10 РјРёРЅСѓС‚',
  },
  {
    id: 'short-quiff',
    name: 'Short Quiff',
    role: 'РЎРјРµР»РµРµ',
    images: imageSet('short-quiff'),
    allowed: {
      topLength: ['medium', 'long'],
      sidePreference: ['soft_taper', 'fade'],
      styling: ['medium'],
      beard: ['none', 'stubble', 'short_beard'],
    },
    scores: {
      faceShape: { oval: 4, round: 3, square: 4, long: -3, unknown: 1 },
      hairType: { thin: 0, normal: 3, thick: 4, wavy: 2 },
      changeLevel: { safe: 0, noticeable: 3, bold: 4 },
      style: { clean: 2, business: 2, street: 3, bold: 4 },
      currentSides: { fresh_short: 2, grown: 3, natural: 1, unknown: 1 },
    },
    clientWhy: 'Р”РѕР±Р°РІР»СЏРµС‚ РІС‹СЃРѕС‚Сѓ Рё Р·Р°РјРµС‚РЅСѓСЋ С„РѕСЂРјСѓ, РЅРѕ С‚СЂРµР±СѓРµС‚ РіРѕС‚РѕРІРЅРѕСЃС‚Рё СѓРєР»Р°РґС‹РІР°С‚СЊСЃСЏ.',
    barberNote: 'РЎРѕС…СЂР°РЅРёС‚СЊ РґР»РёРЅСѓ РІ С„СЂРѕРЅС‚Р°Р»СЊРЅРѕР№ Р·РѕРЅРµ, Р±РѕРєР° РґРµСЂР¶Р°С‚СЊ С‡РёСЃС‚С‹РјРё, РѕР±СЉСЏСЃРЅРёС‚СЊ РєР»РёРµРЅС‚Сѓ СѓРєР»Р°РґРєСѓ С„РµРЅРѕРј.',
    upkeep: '10 РјРёРЅСѓС‚',
  },
  {
    id: 'soft-flow',
    name: 'Soft Flow',
    role: 'РЎРѕС…СЂР°РЅРёС‚СЊ РґР»РёРЅСѓ',
    images: imageSet('soft-flow'),
    allowed: {
      topLength: ['medium', 'long'],
      sidePreference: ['no_short', 'soft_taper'],
      styling: ['low', 'medium'],
      beard: ['none', 'stubble', 'short_beard', 'full_beard'],
    },
    scores: {
      faceShape: { oval: 4, round: 0, square: 2, long: 3, unknown: 2 },
      hairType: { thin: 0, normal: 3, thick: 3, wavy: 5 },
      changeLevel: { safe: 3, noticeable: 2, bold: 0 },
      style: { clean: 2, business: 2, street: 4, bold: 0 },
      currentSides: { fresh_short: 0, grown: 4, natural: 4, unknown: 2 },
    },
    clientWhy: 'РЎРѕС…СЂР°РЅСЏРµС‚ РґР»РёРЅСѓ Рё РІС‹РіР»СЏРґРёС‚ РµСЃС‚РµСЃС‚РІРµРЅРЅРѕ, РµСЃР»Рё РЅРµ С…РѕС‡РµС‚СЃСЏ РєРѕСЂРѕС‚РєРёРµ Р±РѕРєР°.',
    barberNote: 'РЎР»РѕРё РїРѕ РІРµСЂС…РЅРµР№ Р·РѕРЅРµ, СѓР±СЂР°С‚СЊ С‚СЏР¶РµСЃС‚СЊ РІРѕРєСЂСѓРі СѓС€РµР№, РѕСЃС‚Р°РІРёС‚СЊ РЅР°С‚СѓСЂР°Р»СЊРЅСѓСЋ Р»РёРЅРёСЋ СЂРѕСЃС‚Р°.',
    upkeep: '5-10 РјРёРЅСѓС‚',
  },
  {
    id: 'curtains',
    name: 'Curtains / Middle Part',
    role: 'РњСЏРіРєРёР№ С‚СЂРµРЅРґ',
    images: imageSet('curtains'),
    allowed: {
      topLength: ['long'],
      sidePreference: ['no_short', 'soft_taper'],
      styling: ['low', 'medium'],
      beard: ['none', 'stubble'],
    },
    scores: {
      faceShape: { oval: 4, round: 1, square: 2, long: 2, unknown: 2 },
      hairType: { thin: -1, normal: 3, thick: 4, wavy: 5 },
      changeLevel: { safe: 1, noticeable: 4, bold: 2 },
      style: { clean: 1, business: 0, street: 5, bold: 2 },
      currentSides: { fresh_short: -1, grown: 4, natural: 4, unknown: 1 },
    },
    clientWhy: 'Р Р°Р±РѕС‚Р°РµС‚, РµСЃР»Рё СѓР¶Рµ РµСЃС‚СЊ РґР»РёРЅР° Рё С…РѕС‡РµС‚СЃСЏ Р±РѕР»РµРµ РјСЏРіРєРёР№ РјРѕР»РѕРґРµР¶РЅС‹Р№ СЃРёР»СѓСЌС‚.',
    barberNote: 'РќРµ СЃРЅРёРјР°С‚СЊ РґР»РёРЅСѓ СЃРїРµСЂРµРґРё, СЂР°СЃРєСЂС‹С‚СЊ Р»РёС†Рѕ, СѓР±СЂР°С‚СЊ С‚СЏР¶РµСЃС‚СЊ РїРѕ Р±РѕРєР°Рј Рё Р·Р°С‚С‹Р»РєСѓ.',
    upkeep: '5-10 РјРёРЅСѓС‚',
  },
];

const initialAnswers = questions.reduce((acc, question) => {
  acc[question.id] = '';
  return acc;
}, {});

const haircutCopy = {
  'low-taper': {
    clientWhy: 'Самый безопасный способ выглядеть свежее: чистые виски, натуральный верх, без резкой смены образа.',
    barberNote: 'Низкий taper на висках и затылке. Сверху сохранить натуральную форму и не делать контур слишком жестким.',
    upkeep: '0-3 минуты',
  },
  'textured-crop': {
    clientWhy: 'Убирает лишний объем по бокам и дает современную форму без сложной ежедневной укладки.',
    barberNote: 'Сделать текстуру сверху, не утяжелять челку, по бокам держать clean taper или fade.',
    upkeep: '3-5 минут',
  },
  'french-crop': {
    clientWhy: 'Короткая текстура выглядит современно и не требует фена каждый день.',
    barberNote: 'Короткая текстурная челка, аккуратная филировка сверху, fade подобрать по форме головы.',
    upkeep: '0-5 минут',
  },
  'crew-cut': {
    clientWhy: 'Чистый короткий силуэт, который легко носить без стайлинга.',
    barberNote: 'Сверху чуть длиннее, чем по бокам. Переход держать низко или средне, не делать плоскую макушку.',
    upkeep: '0 минут',
  },
  'buzz-fade': {
    clientWhy: 'Минимум укладки и резкое ощущение свежести, если человек готов к короткой форме.',
    barberNote: 'Верх 6-12 мм по форме головы, fade не задирать слишком высоко, контур оставить чистым.',
    upkeep: '0 минут',
  },
  'classic-scissor': {
    clientWhy: 'Не выглядит как резкая смена имиджа, но делает форму дороже и аккуратнее.',
    barberNote: 'Работа ножницами, натуральные виски, убрать лишнюю массу на макушке, оставить живое движение волос.',
    upkeep: '3-5 минут',
  },
  'modern-side-part': {
    clientWhy: 'Собранный взрослый образ, который хорошо работает с офисным стилем и бородой.',
    barberNote: 'Сохранить длину сверху, мягкий пробор, убрать массу по бокам и выровнять связку с бородой.',
    upkeep: '5-10 минут',
  },
  'ivy-league': {
    clientWhy: 'Коротко и аккуратно, но не скучно. Хороший вариант, если хочется выглядеть взрослее.',
    barberNote: 'Сверху оставить длину для легкого направления, виски мягко почистить через taper или fade.',
    upkeep: '3-5 минут',
  },
  'messy-fringe': {
    clientWhy: 'Дает молодую текстуру и движение, если волосы позволяют держать форму.',
    barberNote: 'Оставить движение спереди, снять массу по бокам, не делать тяжелую челку.',
    upkeep: '3-10 минут',
  },
  'short-quiff': {
    clientWhy: 'Добавляет высоту и заметную форму, но требует готовности укладываться.',
    barberNote: 'Сохранить длину во фронтальной зоне, бока держать чище и объяснить укладку феном.',
    upkeep: '10 минут',
  },
  'soft-flow': {
    clientWhy: 'Сохраняет длину и выглядит естественно, если не хочется коротких боков.',
    barberNote: 'Слои по верхней зоне, убрать тяжесть вокруг ушей, оставить натуральную линию роста.',
    upkeep: '5-10 минут',
  },
  curtains: {
    clientWhy: 'Работает, если длина уже есть и хочется мягкий молодежный силуэт.',
    barberNote: 'Не снимать длину спереди, открыть лицо, убрать тяжесть по бокам и затылку.',
    upkeep: '5-10 минут',
  },
};

const answerLabels = questions.reduce((acc, question) => {
  question.options.forEach((option) => {
    acc[option.value] = option.label;
  });
  return acc;
}, {});

boneMassOptions.forEach((option) => {
  answerLabels[option.value] = option.label;
});

const questionById = questions.reduce((acc, question) => {
  acc[question.id] = question;
  return acc;
}, {});

const scanReviewFields = [
  { id: 'faceShape', label: 'Форма лица', options: questionById.faceShape.options },
  { id: 'beard', label: 'Борода', options: questionById.beard.options },
  { id: 'topLength', label: 'Длина сверху', options: questionById.topLength.options },
  { id: 'currentSides', label: 'Бока сейчас', options: questionById.currentSides.options },
  { id: 'hairType', label: 'Тип волос', options: questionById.hairType.options },
  { id: 'boneMass', label: 'Костная масса', options: boneMassOptions },
];

const boneMassScoreByHaircut = {
  'low-taper': { light: 1, medium: 2, strong: 2 },
  'textured-crop': { light: 0, medium: 2, strong: 3 },
  'french-crop': { light: 1, medium: 2, strong: 2 },
  'crew-cut': { light: -1, medium: 1, strong: 3 },
  'buzz-fade': { light: -2, medium: 0, strong: 4 },
  'classic-scissor': { light: 3, medium: 2, strong: 1 },
  'modern-side-part': { light: 1, medium: 2, strong: 3 },
  'ivy-league': { light: 1, medium: 2, strong: 2 },
  'messy-fringe': { light: 2, medium: 2, strong: 0 },
  'short-quiff': { light: 0, medium: 2, strong: 3 },
  'soft-flow': { light: 3, medium: 2, strong: 0 },
  curtains: { light: 3, medium: 1, strong: -1 },
};

const boneMassNotes = {
  light: 'Система видит более мягкую костную структуру, поэтому слегка поднимает формы с естественным контуром без лишней жесткости.',
  medium: 'Система видит сбалансированную структуру, поэтому в финале больше решают длина, укладка и стиль жизни.',
  strong: 'Система видит более выраженную челюсть и скулы, поэтому слегка повышает формы с четким краем и более чистыми боками.',
  unknown: 'Костная структура определилась неуверенно, поэтому этот параметр остается нейтральным.',
};

function passesHardFilters(haircut, answers) {
  return Object.entries(haircut.allowed).every(([key, allowedValues]) => {
    const value = answers[key];
    return !value || allowedValues.includes(value);
  });
}

function scoreHaircut(haircut, answers) {
  let score = 0;

  Object.entries(answers).forEach(([key, value]) => {
    if (!value) return;
    if (haircut.allowed[key]?.includes(value)) score += 3;
    score += haircut.scores[key]?.[value] || 0;
  });

  if (answers.boneMass && answers.boneMass !== 'unknown') {
    score += boneMassScoreByHaircut[haircut.id]?.[answers.boneMass] || 0;
  }

  return score;
}

function pickImage(haircut, beard, faceShape = 'oval', angle = 'front') {
  const fallbackOrder = {
    none: ['none', 'stubble'],
    stubble: ['stubble', 'none'],
    short_beard: ['short_beard', 'full_beard', 'stubble'],
    full_beard: ['full_beard', 'short_beard'],
  };

  const shape = faceShapes.includes(faceShape) ? faceShape : 'oval';
  const images = haircut.images[shape] || haircut.images.oval;
  const key = fallbackOrder[beard]?.find((candidate) => images[candidate]);
  const selected = images[key] || Object.values(images)[0];
  return selected?.[angle] || selected?.front || selected?.legacy;
}

function pickFallbackImage(haircut, beard, faceShape = 'oval') {
  const shape = faceShapes.includes(faceShape) ? faceShape : 'oval';
  const images = haircut.images[shape] || haircut.images.oval;
  const selected = images[beard] || images.none || Object.values(images)[0];
  return selected?.front || selected?.legacy;
}

function ReferenceImage({ src, fallbackSrc, alt }) {
  return (
    <img
      src={src}
      alt={alt}
      onError={(event) => {
        if (fallbackSrc && event.currentTarget.src !== new URL(fallbackSrc, window.location.origin).href) {
          event.currentTarget.src = fallbackSrc;
        }
      }}
    />
  );
}

let faceLandmarkerPromise;

function loadFaceLandmarker() {
  if (!faceLandmarkerPromise) {
    faceLandmarkerPromise = FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm',
    ).then(async (vision) => {
      const options = {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
      };

      try {
        return await FaceLandmarker.createFromOptions(vision, {
          ...options,
          baseOptions: { ...options.baseOptions, delegate: 'GPU' },
        });
      } catch {
        return FaceLandmarker.createFromOptions(vision, options);
      }
    });
  }

  return faceLandmarkerPromise;
}

function captureVideoFrame(video) {
  const canvas = document.createElement('canvas');
  const width = video.videoWidth || 720;
  const height = video.videoHeight || 960;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.84);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function scoreRange(value, target, tolerance) {
  return clamp01(1 - Math.abs(value - target) / tolerance);
}

function measurePoseStillness(currentPose, previousPose) {
  if (!currentPose?.hasFace || !previousPose?.hasFace) return 0;

  const turnDelta = Math.abs((currentPose.turnMetric || 0) - (previousPose.turnMetric || 0));
  const centerDelta = Math.hypot((currentPose.centerX || 0) - (previousPose.centerX || 0), (currentPose.centerY || 0) - (previousPose.centerY || 0));
  const rollDelta = Math.abs((currentPose.roll || 0) - (previousPose.roll || 0));
  const sizeDelta = Math.abs((currentPose.width || 0) - (previousPose.width || 0)) + Math.abs((currentPose.height || 0) - (previousPose.height || 0));
  const motion = turnDelta * 1.35 + centerDelta * 2.8 + rollDelta * 1.1 + sizeDelta * 1.4;
  return clamp01(1 - motion / 0.18);
}

function evaluateFacePose(landmarks, target) {
  if (!landmarks?.length) {
    return { ok: false, message: 'Покажи одно лицо в кадре', yaw: 0, progress: 0, quality: 0, hasFace: false };
  }

  const targetConfig = scannerFrameTargets[target] || scannerFrameTargets.front;
  const xs = landmarks.map((point) => point.x);
  const ys = landmarks.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  const centerX = minX + width / 2;
  const centerY = minY + height / 2;
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const nose = landmarks[1] || landmarks[4];
  const forehead = landmarks[10];
  const chin = landmarks[152];
  const eyeDistance = Math.max(0.001, Math.abs(rightEye.x - leftEye.x));
  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const yaw = (nose.x - eyeMidX) / eyeDistance;
  const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  const verticalBias = forehead && chin ? Math.abs((forehead.y + chin.y) / 2 - centerY) : 0;
  const profileMode = target !== 'front';
  const normalizedEyeSpan = eyeDistance / Math.max(0.001, width);
  const noseOffset = (nose.x - centerX) / Math.max(0.001, width / 2);
  const targetTurn = profileMode ? targetConfig.yaw : 0;
  const turnMetric = profileMode ? noseOffset : yaw;
  const yawScore = scoreRange(turnMetric, targetTurn, targetConfig.yawTolerance);
  const widthScore = scoreRange(width, targetConfig.width, 0.11);
  const heightScore = scoreRange(height, targetConfig.height, 0.14);
  const centerXTolerance = target === 'front' ? 0.16 : 0.22;
  const centerYTarget = target === 'front' ? 0.48 : 0.5;
  const centerYTolerance = target === 'front' ? 0.18 : 0.22;
  const centeredScore = Math.min(scoreRange(centerX, 0.5, centerXTolerance), scoreRange(centerY, centerYTarget, centerYTolerance));
  const rollScore = scoreRange(Math.abs(roll), 0, profileMode ? 0.42 : 0.2);
  const symmetryScore = scoreRange(verticalBias, 0, profileMode ? 0.16 : 0.08);
  const profileStrengthScore = profileMode ? clamp01((Math.abs(noseOffset) - 0.26) / 0.18) : 1;
  const eyeCompressionScore = profileMode ? clamp01((0.36 - normalizedEyeSpan) / 0.14) : clamp01((normalizedEyeSpan - 0.2) / 0.2);
  const quality = clamp01(
    profileMode
      ? yawScore * 0.26 + profileStrengthScore * 0.24 + eyeCompressionScore * 0.12 + widthScore * 0.12 + heightScore * 0.1 + centeredScore * 0.1 + rollScore * 0.06
      : yawScore * 0.24 + widthScore * 0.18 + heightScore * 0.18 + centeredScore * 0.22 + rollScore * 0.1 + symmetryScore * 0.08,
  );

  const centered =
    target === 'front'
      ? centerX > 0.31 && centerX < 0.69 && centerY > 0.2 && centerY < 0.76
      : centerX > 0.24 && centerX < 0.76 && centerY > 0.18 && centerY < 0.8;
  const closeEnough = target === 'front' ? width > 0.22 && height > 0.26 : width > 0.18 && height > 0.24;
  const levelEnough = Math.abs(roll) < (profileMode ? 0.38 : 0.2);
  const targetDirection = target === 'right' ? -1 : target === 'left' ? 1 : 0;
  const targetOk =
    target === 'front'
      ? Math.abs(yaw) < 0.1
      : Math.sign(noseOffset || 0) === targetDirection && Math.abs(noseOffset) > 0.3;
  const profileSign = noseOffset < 0 ? 'negative' : 'positive';

  const responseBase = {
    yaw,
    progress: 0,
    quality,
    profileSign,
    hasFace: true,
    centerX,
    centerY,
    width,
    height,
    roll,
    turnMetric,
  };

  if (!centered) return { ok: false, message: 'Держи лицо по центру рамки', ...responseBase, progress: 0.12 };
  if (!closeEnough) return { ok: false, message: 'Подвинься чуть ближе', ...responseBase, progress: 0.22 };
  if (!levelEnough) return { ok: false, message: 'Не наклоняй голову, держи профиль ровно', ...responseBase, progress: 0.34 };
  if (!targetOk) {
    const turnProgress = profileMode ? clamp01((Math.abs(noseOffset) - 0.08) / 0.28) : yawScore * 0.78;
    const message = target === 'front' ? 'Смотри прямо' : 'Довернись до чистого профиля и замри';
    return { ok: false, message, ...responseBase, progress: Math.max(0.3, turnProgress) };
  }

  if (quality < targetConfig.minQuality) {
    return { ok: false, message: profileMode ? 'Держи полный профиль, почти поймал' : 'Замри на секунду, почти готово', ...responseBase, progress: Math.max(0.62, quality * 0.9) };
  }

  return { ok: true, message: profileMode ? 'Полный профиль найден, не двигайся' : 'Не двигайся, фиксирую кадр', ...responseBase, progress: quality };
}

function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file selected.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected photo.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Could not decode the selected photo.'));
      image.onload = () => {
        const maxSide = 1100;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function isConfidentScanValue(analysis, field) {
  const value = analysis?.[field];
  const confidence = Number(analysis?.confidence?.[field] || 0);
  return Boolean(value && value !== 'unknown' && confidence >= scanConfidenceThreshold);
}

function answersFromAnalysis(analysis) {
  return scannerDerivedFields.reduce((acc, field) => {
    if (isConfidentScanValue(analysis, field)) acc[field] = analysis[field];
    return acc;
  }, {});
}

function rejectionReason(haircut, answers) {
  if (answers.beard && !haircut.allowed.beard.includes(answers.beard)) {
    return 'не совпадает по бороде';
  }

  if (answers.sidePreference && !haircut.allowed.sidePreference.includes(answers.sidePreference)) {
    return 'не подходит по бокам и fade';
  }

  if (answers.styling && !haircut.allowed.styling.includes(answers.styling)) {
    return 'требует другой уровень укладки';
  }

  if (answers.topLength && !haircut.allowed.topLength.includes(answers.topLength)) {
    return 'не подходит под текущую длину';
  }

  return 'слабое совпадение';
}

function buildResults(answers) {
  const scored = haircuts
    .map((haircut) => ({
      ...haircut,
      score: scoreHaircut(haircut, answers),
      image: pickImage(haircut, answers.beard, answers.faceShape, 'front'),
      fallbackImage: pickFallbackImage(haircut, answers.beard, answers.faceShape),
      rejected: !passesHardFilters(haircut, answers),
      reason: rejectionReason(haircut, answers),
    }))
    .sort((a, b) => b.score - a.score);

  const allowed = scored.filter((haircut) => !haircut.rejected);
  const fallback = scored.filter((haircut) => haircut.rejected).slice(0, 2);
  const selected = allowed.length >= 4 ? allowed.slice(0, 4) : [...allowed, ...fallback].slice(0, 4);

  return selected.map((haircut, index) => ({
    ...haircut,
    ...haircutCopy[haircut.id],
    resultLabel: ['Лучший вариант', 'Смелее', 'Без лишней укладки', 'Альтернатива'][index] || 'Вариант',
  }));
}

const faceProfiles = {
  oval: {
    label: 'Oval',
    head: 'M120 55 C88 55 67 83 67 128 C67 181 90 224 120 224 C150 224 173 181 173 128 C173 83 152 55 120 55Z',
  },
  round: {
    label: 'Round',
    head: 'M120 62 C83 62 58 90 58 130 C58 177 84 214 120 214 C156 214 182 177 182 130 C182 90 157 62 120 62Z',
  },
  square: {
    label: 'Square',
    head: 'M120 58 C87 58 66 82 66 123 L66 174 C66 203 90 225 120 225 C150 225 174 203 174 174 L174 123 C174 82 153 58 120 58Z',
  },
  long: {
    label: 'Long',
    head: 'M120 42 C90 42 70 69 70 122 C70 188 91 238 120 238 C149 238 170 188 170 122 C170 69 150 42 120 42Z',
  },
};

const hairLooks = {
  'low-taper': {
    top: 'M69 105 C78 71 98 55 126 55 C150 55 168 70 174 101 C162 91 148 87 130 89 C105 92 89 100 69 105Z',
    front: 'M88 86 C106 69 131 64 154 77 C139 82 124 84 106 91 C97 95 91 100 82 107 C82 99 84 92 88 86Z',
    side: 'M66 112 C73 95 86 87 100 85 C90 101 84 120 82 139 C73 134 68 125 66 112Z',
  },
  'textured-crop': {
    top: 'M62 109 C68 79 91 61 124 58 C153 56 175 73 181 104 C164 95 147 96 131 103 C110 113 86 112 62 109Z',
    front: 'M76 96 L94 77 L106 99 L121 73 L135 99 L153 78 L164 103 C136 96 109 116 76 96Z',
  },
  'french-crop': {
    top: 'M64 104 C74 73 96 59 126 59 C154 59 174 75 180 105 C158 100 137 104 117 109 C96 115 80 112 64 104Z',
    front: 'M71 105 C92 113 115 112 138 104 C153 99 166 98 180 103 L177 122 C144 112 108 126 72 116Z',
  },
  'crew-cut': {
    top: 'M72 96 C83 71 101 60 125 60 C151 60 168 75 176 101 C143 90 110 90 72 96Z',
    front: 'M86 84 C107 76 134 75 158 86 L155 99 C133 93 111 93 89 99Z',
  },
  'buzz-fade': {
    top: 'M76 92 C87 70 103 60 124 60 C148 60 165 74 173 99 C140 88 109 88 76 92Z',
    front: 'M82 93 C106 86 140 87 168 99 L166 110 C137 102 107 102 79 108Z',
  },
  'classic-scissor': {
    top: 'M62 112 C68 78 92 55 124 53 C156 51 177 74 183 112 C166 96 142 91 119 101 C96 111 80 113 62 112Z',
    front: 'M77 90 C95 68 128 58 157 73 C143 78 129 84 112 93 C100 100 89 105 73 108 C73 101 74 95 77 90Z',
  },
  'ivy-league': {
    top: 'M65 106 C75 76 99 57 130 58 C156 58 176 75 181 106 C157 94 134 92 113 101 C94 109 78 111 65 106Z',
    front: 'M78 88 C101 66 136 63 165 82 C145 85 126 91 106 101 C94 107 83 109 72 108 C72 99 74 93 78 88Z',
  },
  'modern-side-part': {
    top: 'M63 111 C73 78 97 57 128 56 C157 55 178 75 183 109 C164 96 142 92 119 102 C98 112 80 116 63 111Z',
    front: 'M81 85 C105 65 141 62 168 82 C151 86 132 93 111 104 C99 111 87 113 72 110 C73 100 76 91 81 85Z',
    part: 'M103 69 C96 85 91 97 88 113',
  },
  'messy-fringe': {
    top: 'M58 113 C66 77 92 55 126 55 C158 55 181 76 186 111 C166 101 145 104 126 116 C105 128 80 127 58 113Z',
    front: 'M70 96 L92 78 L99 113 L119 78 L127 118 L150 83 L159 115 L177 101 C162 127 129 139 97 132 C83 129 74 118 70 96Z',
  },
  'short-quiff': {
    top: 'M66 109 C73 76 95 58 126 57 C158 57 179 76 184 111 C165 99 144 96 123 105 C101 115 82 116 66 109Z',
    front: 'M82 92 C100 58 137 48 166 75 C142 75 122 86 107 103 C98 114 88 118 74 111 C75 103 78 97 82 92Z',
  },
  'soft-flow': {
    top: 'M55 119 C61 80 90 51 126 50 C162 49 187 78 190 119 C173 102 153 99 132 111 C106 126 78 132 55 119Z',
    front: 'M71 96 C91 71 122 62 153 77 C139 90 127 104 115 119 C99 139 77 137 61 122 C64 113 67 104 71 96Z',
  },
  curtains: {
    top: 'M56 119 C61 80 89 52 123 50 C160 49 187 78 190 119 C170 104 151 101 132 113 C105 130 79 132 56 119Z',
    front: 'M78 86 C98 67 119 61 124 62 C109 83 99 106 94 134 C81 129 69 119 64 106 C67 98 72 91 78 86ZM128 62 C150 64 169 79 178 100 C171 119 158 131 142 137 C141 111 136 86 128 62Z',
    part: 'M124 62 C121 88 121 115 123 140',
  },
};

function MannequinPreview({ haircutId, faceShape = 'oval', beard = 'none', label = '' }) {
  const shapeKey = faceProfiles[faceShape] ? faceShape : 'oval';
  const profile = faceProfiles[shapeKey];
  const hair = hairLooks[haircutId] || hairLooks['low-taper'];
  const hasStubble = beard === 'stubble';
  const hasBeard = beard === 'short_beard' || beard === 'full_beard';
  const beardPath =
    beard === 'full_beard'
      ? 'M75 151 C83 198 99 224 120 232 C141 224 157 198 165 151 C153 175 139 188 120 188 C101 188 87 175 75 151Z'
      : 'M83 164 C91 198 105 216 120 222 C135 216 149 198 157 164 C144 183 135 191 120 191 C105 191 96 183 83 164Z';

  return (
    <svg className="mannequin-preview" viewBox="0 0 240 300" role="img" aria-label={label || `${profile.label} mannequin ${haircutId}`}>
      <defs>
        <linearGradient id={`skin-${shapeKey}-${haircutId}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#fffdf7" />
          <stop offset="100%" stopColor="#e5dfd2" />
        </linearGradient>
        <linearGradient id={`hair-${shapeKey}-${haircutId}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#2c2119" />
          <stop offset="100%" stopColor="#0f0d0b" />
        </linearGradient>
      </defs>
      <rect width="240" height="300" fill="#f7f0e4" />
      <path d="M91 213 H149 L159 278 H81 Z" fill="#e8e1d5" />
      <path d="M76 274 C91 252 149 252 164 274 H76Z" fill="#d8d0c2" opacity="0.9" />
      <ellipse cx="65" cy="139" rx="13" ry="26" fill="#e8e1d5" />
      <ellipse cx="175" cy="139" rx="13" ry="26" fill="#e8e1d5" />
      <path d={profile.head} fill={`url(#skin-${shapeKey}-${haircutId})`} stroke="#d2c9ba" strokeWidth="4" />
      {hasStubble ? <path d={beardPath} fill="#7a7066" opacity="0.18" /> : null}
      {hasBeard ? <path d={beardPath} fill="#2b211b" opacity={beard === 'full_beard' ? '0.9' : '0.76'} /> : null}
      <path d={hair.top} fill={`url(#hair-${shapeKey}-${haircutId})`} />
      {hair.side ? <path d={hair.side} fill="#1b1511" opacity="0.72" /> : null}
      {hair.front ? <path d={hair.front} fill="#18120f" /> : null}
      {hair.part ? <path d={hair.part} fill="none" stroke="#f2eadc" strokeWidth="4" strokeLinecap="round" opacity="0.65" /> : null}
      <path d="M91 136 C99 131 107 131 114 136" fill="none" stroke="#8d8377" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
      <path d="M126 136 C133 131 142 131 149 136" fill="none" stroke="#8d8377" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
      <path d="M119 144 C115 157 114 164 121 167" fill="none" stroke="#c7bdad" strokeWidth="4" strokeLinecap="round" />
      <path d="M101 183 C113 191 128 191 140 183" fill="none" stroke="#9b9083" strokeWidth="4" strokeLinecap="round" opacity="0.72" />
      <text x="120" y="288" textAnchor="middle" fill="#6f675e" fontSize="13" fontWeight="800">
        {profile.label}
      </text>
    </svg>
  );
}

function App() {
  const [answers, setAnswers] = useState(initialAnswers);
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState('scan');
  const [scanPhotos, setScanPhotos] = useState({});
  const [scanAnalysis, setScanAnalysis] = useState(null);
  const [confirmedScanFields, setConfirmedScanFields] = useState([]);
  const [scanAttempts, setScanAttempts] = useState(0);
  const [scanStatus, setScanStatus] = useState({ loading: false, error: '' });

  const visibleQuestions = useMemo(
    () => questions.filter((question) => !confirmedScanFields.includes(question.id)),
    [confirmedScanFields],
  );
  const currentQuestion = visibleQuestions[step] || visibleQuestions[0];
  const progress = visibleQuestions.length ? Math.round(((step + 1) / visibleQuestions.length) * 100) : 100;
  const ranked = useMemo(() => buildResults(answers), [answers]);
  const topPick = ranked[0];

  const selectAnswer = (value) => {
    if (!currentQuestion) return;
    setAnswers((current) => ({ ...current, [currentQuestion.id]: value }));
  };

  const goNext = () => {
    if (step < visibleQuestions.length - 1) {
      setStep((current) => current + 1);
      return;
    }
    setMode('result');
  };

  const reset = () => {
    setAnswers(initialAnswers);
    setStep(0);
    setMode('scan');
    setScanPhotos({});
    setScanAnalysis(null);
    setConfirmedScanFields([]);
    setScanAttempts(0);
    setScanStatus({ loading: false, error: '' });
  };

  const updateScanPhoto = (slot, photo) => {
    setScanPhotos((current) => ({ ...current, [slot]: photo }));
    setScanStatus({ loading: false, error: '' });
  };

  const analyzeScan = async () => {
    setScanAttempts((current) => current + 1);
    setScanStatus({ loading: true, error: '' });

    try {
      const response = await fetch('/api/face-scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ photos: scanPhotos }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось выполнить скан лица.');

      const analysis = payload.analysis || {};
      setScanAnalysis(analysis);
      setAnswers((current) => ({ ...current, ...answersFromAnalysis(analysis), boneMass: analysis.boneMass || '' }));
      setMode('scanReview');
    } catch (error) {
      setScanStatus({ loading: false, error: error.message || 'Не удалось выполнить скан лица.' });
    }
  };

  const startManualReview = () => {
    const manualAnalysis = {
      faceShape: 'unknown',
      beard: 'unknown',
      topLength: 'unknown',
      currentSides: 'unknown',
      hairType: 'unknown',
      boneMass: 'unknown',
      confidence: {},
      photoQuality: {},
      notes: 'Режим ручной проверки. AI-скан был пропущен или временно недоступен.',
    };
    setScanAnalysis(manualAnalysis);
    setAnswers((current) => ({ ...current, boneMass: 'unknown' }));
    setMode('scanReview');
  };

  const updateReviewAnswer = (field, value) => {
    setAnswers((current) => ({ ...current, [field]: value === 'unknown' ? '' : value }));
  };

  const confirmScanReview = () => {
    const confidentFields = scannerDerivedFields.filter(
      (field) => answers[field] && isConfidentScanValue(scanAnalysis, field) && answers[field] === scanAnalysis[field],
    );
    setConfirmedScanFields(confidentFields);
    setStep(0);
    setMode('quiz');
  };

  return (
    <main className="app-shell">
      <div className="scene-glow scene-glow-a" aria-hidden="true" />
      <div className="scene-glow scene-glow-b" aria-hidden="true" />
      <div className="scene-grid" aria-hidden="true" />
      <section className="phone-frame">
        <div className="topbar">
          <div className="topbar-copy">
            <span className="caption">Barber.Cafe</span>
            <h1>Подбор стрижки</h1>
          </div>
          <div className="topbar-pill">
            <span className="topbar-pill-dot" />
            Скан лица
          </div>
          <button className="icon-button" aria-label="Сбросить" title="Сбросить" onClick={reset}>
            <RotateCcw size={18} />
          </button>
        </div>

        {mode === 'scan' ? (
          <ScanView
            photos={scanPhotos}
            status={scanStatus}
            attempts={scanAttempts}
            onPhoto={updateScanPhoto}
            onAnalyze={analyzeScan}
            onManualReview={startManualReview}
          />
        ) : mode === 'scanReview' ? (
          <ScanReviewView
            analysis={scanAnalysis}
            answers={answers}
            onChange={updateReviewAnswer}
            onConfirm={confirmScanReview}
            onBack={() => setMode('scan')}
          />
        ) : mode === 'quiz' && currentQuestion ? (
          <QuizView
            question={currentQuestion}
            step={step}
            progress={progress}
            totalSteps={visibleQuestions.length}
            answers={answers}
            onSelect={selectAnswer}
            onNext={goNext}
            onBack={() => setStep((current) => Math.max(0, current - 1))}
          />
        ) : (
          <ResultView answers={answers} analysis={scanAnalysis} ranked={ranked} topPick={topPick} onRestart={reset} />
        )}
      </section>

      <aside className="desktop-panel">
        <div className="panel-card signal-card">
          <div className="panel-icon">
            <Sparkles size={20} />
          </div>
          <span className="panel-eyebrow">Сканер сначала</span>
          <h2>Умный первый фильтр</h2>
          <p>
            Сначала отсеиваем слабые варианты, потом ранжируем только те стрижки, которые реально подходят по волосам, лицу и текущей бороде.
          </p>
        </div>

        <div className="panel-card">
          <h3>Как это работает</h3>
          <ul>
            <li><UserRoundCheck size={16} /> MediaPipe проверяет положение головы и качество кадра в реальном времени.</li>
            <li><ShieldCheck size={16} /> Claude Vision считывает фото и возвращает структурированные признаки.</li>
            <li><ClipboardList size={16} /> Каталог стрижек остается управляемым, без случайных AI-референсов.</li>
          </ul>
        </div>

        <div className="mini-catalog">
          {haircuts.slice(0, 5).map((haircut) => (
            <div className="mini-style" key={haircut.id}>
              <img src={pickImage(haircut, 'stubble', 'oval')} alt="" />
              <span>{haircut.name}</span>
            </div>
          ))}
        </div>
      </aside>
    </main>
  );
}

function ScanView({ photos, status, attempts, onPhoto, onAnalyze, onManualReview }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const landmarkerRef = useRef(null);
  const rafRef = useRef(0);
  const stableFramesRef = useRef(0);
  const capturedProfileSignsRef = useRef({});
  const slotStartedAtRef = useRef(0);
  const capturedSlotsRef = useRef({});
  const previousPoseRef = useRef(null);
  const currentSlotRef = useRef(scanPhotoSteps[0]);
  const autoAnalyzeRef = useRef(false);
  const [liveState, setLiveState] = useState({
    active: false,
    loading: false,
    error: '',
    message: 'Запусти сканер, чтобы начать',
    progress: 0,
    quality: 0,
    countdown: '',
    flash: false,
  });
  const allPhotosReady = scanPhotoSteps.every((slot) => photos[slot.id]);
  const currentSlot = scanPhotoSteps.find((slot) => !photos[slot.id]) || scanPhotoSteps[scanPhotoSteps.length - 1];

  useEffect(() => {
    capturedSlotsRef.current = photos;
    if (!photos.rightProfile) delete capturedProfileSignsRef.current.rightProfile;
    if (!photos.leftProfile) delete capturedProfileSignsRef.current.leftProfile;
    const nextSlot = scanPhotoSteps.find((slot) => !photos[slot.id]) || null;
    const slotChanged = currentSlotRef.current?.id !== nextSlot?.id;
    currentSlotRef.current = nextSlot;
    if (slotChanged) {
      stableFramesRef.current = 0;
      previousPoseRef.current = null;
      slotStartedAtRef.current = performance.now();
      setLiveState((current) => ({
        ...current,
        progress: 0,
        quality: 0,
        countdown: '',
        flash: false,
        message: nextSlot ? `Подготовь ракурс: ${nextSlot.label.toLowerCase()}` : 'Все ракурсы сняты',
      }));
    }
  }, [photos]);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const handleFile = async (slot, file) => {
    if (!file) return;
    try {
      const compressed = await compressPhoto(file);
      onPhoto(slot, compressed);
    } catch (error) {
      window.alert(error.message || 'Не удалось подготовить фото.');
    }
  };

  const scanFrame = () => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    const slot = currentSlotRef.current;

    if (!video || !landmarker || !slot) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    if (video.readyState >= 2 && video.videoWidth > 0) {
      const now = performance.now();
      const result = landmarker.detectForVideo(video, performance.now());
      const pose = evaluateFacePose(result.faceLandmarks?.[0], slot.target);
      const slotConfig = scannerFrameTargets[slot.target] || scannerFrameTargets.front;
      const slotElapsedMs = now - slotStartedAtRef.current;
      const enoughWarmup = slotElapsedMs > 320;
      const profileMode = slot.target !== 'front';
      const stillness = measurePoseStillness(pose, previousPoseRef.current);
      previousPoseRef.current = pose.hasFace ? pose : null;
      const otherProfileSign =
        slot.id === 'rightProfile'
          ? capturedProfileSignsRef.current.leftProfile
          : slot.id === 'leftProfile'
            ? capturedProfileSignsRef.current.rightProfile
            : null;
      const duplicateProfileSide =
        profileMode &&
        otherProfileSign &&
        pose.profileSign &&
        otherProfileSign === pose.profileSign;
      const stillnessThreshold = slot.target === 'front' ? 0.42 : 0.78;
      const stillEnough = stillness >= stillnessThreshold;
      const canCaptureThisPose = pose.ok && enoughWarmup && !duplicateProfileSide && stillEnough;
      const relaxedDirectionOk =
        slot.target === 'right' ? pose.profileSign === 'negative' : slot.target === 'left' ? pose.profileSign === 'positive' : true;
      const usableFallbackPose =
        profileMode &&
        enoughWarmup &&
        pose.hasFace &&
        !duplicateProfileSide &&
        relaxedDirectionOk &&
        pose.width > 0.16 &&
        pose.height > 0.22 &&
        Math.abs(pose.turnMetric || 0) > 0.18;

      if (canCaptureThisPose) {
        stableFramesRef.current += 1;
      } else {
        stableFramesRef.current = 0;
      }

      const holdProgress = Math.min(1, stableFramesRef.current / slotConfig.holdFrames);
      const framesLeft = Math.max(0, slotConfig.holdFrames - stableFramesRef.current);
      const autoCaptureRemainingMs = Math.max(0, profileAutoCaptureDelayMs - slotElapsedMs);
      const autoCaptureSeconds = Math.ceil(autoCaptureRemainingMs / 1000);
      const liveMessage = duplicateProfileSide
        ? 'Теперь повернись в другой профиль'
        : pose.ok && !stillEnough
          ? slot.target === 'front'
            ? 'Замри на долю секунды'
            : autoCaptureRemainingMs > 0
              ? 'Замри в профиле или просто дождись автоснимка'
              : 'Сохраняю профиль автоматически'
          : pose.message;
      const countdown = canCaptureThisPose
        ? `еще ${(framesLeft / 12).toFixed(framesLeft > 6 ? 1 : 0)}с`
        : profileMode && !capturedSlotsRef.current[slot.id]
          ? autoCaptureRemainingMs > 0
            ? `автоснимок через ${autoCaptureSeconds}с`
            : 'сохраняю кадр...'
          : '';
      setLiveState((current) => ({
        ...current,
        error: '',
        message: liveMessage,
        progress: canCaptureThisPose ? holdProgress : pose.progress,
        quality: pose.quality || 0,
        countdown,
        flash: false,
      }));

      const saveCapturedFrame = (frame, qualityOverride, message) => {
        capturedSlotsRef.current = { ...capturedSlotsRef.current, [slot.id]: frame };
        if (profileMode && pose.profileSign) {
          capturedProfileSignsRef.current[slot.id] = pose.profileSign;
        }
        onPhoto(slot.id, frame);
        stableFramesRef.current = 0;
        previousPoseRef.current = null;
        slotStartedAtRef.current = performance.now();
        setLiveState((current) => ({
          ...current,
          progress: 1,
          quality: qualityOverride,
          countdown: 'Готово',
          message,
          flash: true,
        }));
      };

      if (stableFramesRef.current >= slotConfig.holdFrames && !capturedSlotsRef.current[slot.id]) {
        const pickedFrame = captureVideoFrame(video);
        saveCapturedFrame(pickedFrame, 1, `${slot.label}: кадр сохранен`);
      } else if (profileMode && slotElapsedMs >= profileAutoCaptureDelayMs && !capturedSlotsRef.current[slot.id]) {
        const pickedFrame = captureVideoFrame(video);
        saveCapturedFrame(pickedFrame, Math.max(0.72, pose.quality || 0.72), `${slot.label}: автоснимок сохранен`);
      }
    }

    rafRef.current = requestAnimationFrame(scanFrame);
  };

  const startLiveScanner = async () => {
    setLiveState((current) => ({ ...current, loading: true, error: '', message: 'Запускаю камеру...', progress: 0 }));

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      const landmarker = await loadFaceLandmarker();
      streamRef.current = stream;
      landmarkerRef.current = landmarker;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      slotStartedAtRef.current = performance.now();
      previousPoseRef.current = null;
      setLiveState({
        active: true,
        loading: false,
        error: '',
        message: 'Смотри прямо и заполни рамку',
        progress: 0,
        quality: 0,
        countdown: '',
        flash: false,
      });
      stableFramesRef.current = 0;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(scanFrame);
    } catch (error) {
      setLiveState({
        active: false,
        loading: false,
        error: error.message || 'Камера недоступна. Можно загрузить фото вручную.',
        message: 'Камера недоступна',
        progress: 0,
        quality: 0,
        countdown: '',
        flash: false,
      });
    }
  };

  const stopLiveScanner = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    stableFramesRef.current = 0;
    previousPoseRef.current = null;
    setLiveState((current) => ({
      ...current,
      active: false,
      loading: false,
      progress: 0,
      quality: 0,
      countdown: '',
      flash: false,
      message: 'Сканер остановлен',
    }));
  };

  useEffect(() => {
    if (!allPhotosReady) {
      autoAnalyzeRef.current = false;
      return;
    }

    if (!autoAnalyzeRef.current && !status.loading) {
      autoAnalyzeRef.current = true;
      stopLiveScanner();
      window.setTimeout(() => onAnalyze(), 250);
    }
  }, [allPhotosReady, status.loading, onAnalyze]);

  return (
    <div className="screen-content scanner-screen">
      <section className="question-block scanner-head">
        <span className="caption">скан лица</span>
        <h2>Сначала считаем форму, потом задаем вопросы</h2>
        <p>
          Нам нужны три чистых кадра: анфас, правый и левый профиль. После этого система сузит круг вариантов и сократит анкету.
        </p>
      </section>

      <section className={`live-scanner ${liveState.active ? 'active' : ''}`}>
        <div className={`scanner-video-wrap ${liveState.flash ? 'captured-flash' : ''}`}>
          <video ref={videoRef} className="scanner-video" playsInline muted />
          <div className="scanner-reticle" style={{ '--scan-progress': liveState.progress }} />
          <div className="scanner-topline">
            <span>{currentSlot?.label || 'Готово'}</span>
            <strong>{Math.round((liveState.quality || 0) * 100)}% качество</strong>
          </div>
          <div className="scanner-status">
            <span>{liveState.countdown || (allPhotosReady ? 'Готово' : 'Подсказка')}</span>
            <strong>{allPhotosReady ? 'Все ракурсы сняты' : liveState.message}</strong>
            <div className="scanner-meter" aria-hidden="true">
              <div style={{ width: `${Math.round((liveState.progress || 0) * 100)}%` }} />
            </div>
          </div>
        </div>

        {liveState.error ? (
          <div className="scan-error" role="alert">
            <AlertTriangle size={18} />
            <span>{liveState.error}</span>
          </div>
        ) : null}

        <div className="live-actions">
          <button className="primary-button" type="button" onClick={startLiveScanner} disabled={liveState.loading || liveState.active || allPhotosReady}>
            <Camera size={18} />
            {liveState.loading ? 'Запуск...' : allPhotosReady ? 'Готово' : 'Запустить сканер'}
          </button>
          <button className="ghost-button" type="button" onClick={stopLiveScanner} disabled={!liveState.active}>
            Стоп
          </button>
        </div>
      </section>

      <div className="scan-grid">
        {scanPhotoSteps.map((slot) => (
          <article
            className={`scan-slot ${photos[slot.id] ? 'filled' : ''} ${currentSlot?.id === slot.id && !photos[slot.id] ? 'is-current' : ''}`}
            key={slot.id}
          >
            <div className="scan-preview">
              {photos[slot.id] ? <img src={photos[slot.id]} alt={`${slot.label} превью`} /> : <Camera size={34} />}
            </div>
            <div className="scan-copy">
              <strong>{slot.label}</strong>
              <small>{slot.hint}</small>
            </div>
            <label className="scan-upload">
              <UploadCloud size={16} />
              {photos[slot.id] ? 'Заменить фото' : 'Камера / загрузка'}
              <input
                type="file"
                accept="image/*"
                capture={slot.capture}
                onChange={(event) => handleFile(slot.id, event.target.files?.[0])}
              />
            </label>
          </article>
        ))}
      </div>

      {status.error ? (
        <div className="scan-error" role="alert">
          <AlertTriangle size={18} />
          <span>{status.error}</span>
        </div>
      ) : null}

      <div className="bottom-nav scanner-nav">
        <button className="ghost-button" onClick={onManualReview} disabled={status.loading || attempts < 2}>
          Ручная проверка
        </button>
        <button className="primary-button" onClick={onAnalyze} disabled={!allPhotosReady || status.loading}>
          {status.loading ? 'Анализируем...' : 'Анализировать лицо'}
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}

function ScanReviewView({ analysis, answers, onChange, onConfirm, onBack }) {
  return (
    <div className="screen-content scanner-screen">
      <section className="question-block scanner-head">
        <span className="caption">проверка скана</span>
        <h2>Проверь, что система считала правильно</h2>
        <p>
          Если что-то определилось неуверенно, поправь руками. После подтверждения лишние вопросы мы пропустим.
        </p>
      </section>

      <div className="review-grid">
        {scanReviewFields.map((field) => {
          const confidence = Number(analysis?.confidence?.[field.id] || 0);
          const confident = isConfidentScanValue(analysis, field.id);
          const selectedValue = answers[field.id] || (field.id === 'boneMass' ? analysis?.boneMass || 'unknown' : '');

          return (
            <section className={`review-card ${confident ? 'confident' : 'needs-check'}`} key={field.id}>
              <div className="review-card-head">
                <div>
                  <span className="caption">{field.label}</span>
                  <strong>{answerLabels[selectedValue] || 'Нужно выбрать'}</strong>
                </div>
                <span className="confidence-pill">{Math.round(confidence * 100)}%</span>
              </div>
              <select value={selectedValue || 'unknown'} onChange={(event) => onChange(field.id, event.target.value)}>
                {field.id !== 'boneMass' ? <option value="unknown">Не определено / спросить позже</option> : null}
                {field.options.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </section>
          );
        })}
      </div>

      <section className="scan-notes">
        <span className="caption">качество фото / заметки</span>
        <p>{analysis?.notes || 'Дополнительных заметок нет.'}</p>
        <div className="quality-list">
          <span>{analysis?.photoQuality?.front || 'Анфас принят.'}</span>
          <span>{analysis?.photoQuality?.leftProfile || 'Левый профиль принят.'}</span>
          <span>{analysis?.photoQuality?.rightProfile || 'Правый профиль принят.'}</span>
        </div>
      </section>

      <div className="bottom-nav">
        <button className="ghost-button" onClick={onBack}>
          <ArrowLeft size={18} />
          Назад
        </button>
        <button className="primary-button" onClick={onConfirm}>
          Продолжить
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}

function QuizView({ question, step, progress, totalSteps, answers, onSelect, onNext, onBack }) {
  const selected = answers[question.id];

  return (
    <div className="screen-content">
      <div className="progress-row">
        <span>{question.eyebrow}</span>
        <span>{step + 1}/{totalSteps} / {progress}%</span>
      </div>
      <div className="progress-track">
        <div style={{ width: `${progress}%` }} />
      </div>

      <section className="question-block">
        <h2>{question.title}</h2>
        <p>{question.helper}</p>
      </section>

      <div className="option-grid">
        {question.options.map((option) => (
          <button
            className={`option-card ${selected === option.value ? 'selected' : ''}`}
            key={option.value}
            onClick={() => onSelect(option.value)}
          >
            <span className="check-dot">{selected === option.value ? <Check size={15} /> : null}</span>
            <strong>{option.label}</strong>
            <small>{option.hint}</small>
          </button>
        ))}
      </div>

      <div className="bottom-nav">
        <button className="ghost-button" onClick={onBack} disabled={step === 0}>
          <ArrowLeft size={18} />
          Назад
        </button>
        <button className="primary-button" onClick={onNext} disabled={!selected}>
          {step === totalSteps - 1 ? 'Подобрать' : 'Дальше'}
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}

function ResultView({ answers, analysis, ranked, topPick, onRestart }) {
  const [selectedHaircutId, setSelectedHaircutId] = useState(topPick.id);
  const [openedImage, setOpenedImage] = useState(null);
  const [visualMode, setVisualMode] = useState('photo');
  const [photoAngle, setPhotoAngle] = useState('front');
  const selectedHaircut = ranked.find((haircut) => haircut.id === selectedHaircutId) || topPick;
  const showMannequin = visualMode === 'mannequin';
  const angleLabels = {
    front: 'Анфас',
    'left-profile': 'Левый',
    'right-profile': 'Правый',
  };

  return (
    <div className="screen-content result-screen">
      <section className="result-hero">
        <span className="caption">результат</span>
        <div className="view-toggle" aria-label="Вид изображения">
          <button type="button" className={visualMode === 'photo' ? 'active' : ''} onClick={() => setVisualMode('photo')}>
            Фото
          </button>
          <button type="button" className={visualMode === 'mannequin' ? 'active' : ''} onClick={() => setVisualMode('mannequin')}>
            Манекен
          </button>
        </div>
        {showMannequin ? null : (
          <div className="angle-toggle" aria-label="Ракурс фото">
            {imageAngles.map((angle) => (
              <button
                type="button"
                key={angle}
                className={photoAngle === angle ? 'active' : ''}
                onClick={() => setPhotoAngle(angle)}
              >
                {angleLabels[angle]}
              </button>
            ))}
          </div>
        )}
        <h2>Вот что реально имеет смысл показать клиенту</h2>
        <p>
          Список уже очищен от слабых совпадений. Остались варианты, которые можно объяснить и визуально, и по логике барбера.
        </p>
      </section>

      <div className="result-list">
        {ranked.map((haircut) => {
          const photoSrc = pickImage(haircut, answers.beard, answers.faceShape, photoAngle);
          const fallbackSrc = pickFallbackImage(haircut, answers.beard, answers.faceShape);

          return (
            <article
              className={`style-card ${haircut.id === selectedHaircut.id ? 'selected-result' : ''} ${haircut.rejected ? 'soft-rejected' : ''}`}
              key={haircut.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedHaircutId(haircut.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedHaircutId(haircut.id);
                }
              }}
            >
              <button
                className="photo-button"
                type="button"
                aria-label={`Открыть ${haircut.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpenedImage({ ...haircut, image: photoSrc, fallbackImage: fallbackSrc, angle: photoAngle });
                }}
              >
                {showMannequin ? (
                  <MannequinPreview haircutId={haircut.id} faceShape={answers.faceShape} beard={answers.beard} label={haircut.name} />
                ) : (
                  <ReferenceImage src={photoSrc} fallbackSrc={fallbackSrc} alt={haircut.name} />
                )}
                <span><ZoomIn size={15} /></span>
              </button>
              <div className="style-copy">
                <div className="style-head">
                  <span>{haircut.resultLabel}</span>
                  <strong>{haircut.name}</strong>
                </div>
                <p>{haircut.clientWhy}</p>
                <div className="tags">
                  <span><Clock3 size={13} /> {haircut.upkeep}</span>
                  <span><Scissors size={13} /> рейтинг {haircut.score}</span>
                  {showMannequin ? null : <span>{angleLabels[photoAngle]}</span>}
                  {haircut.rejected ? <span className="warning-pill">{haircut.reason}</span> : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <section className="barber-note">
        <span className="caption">карточка барбера</span>
        <h3>{selectedHaircut.name}</h3>
        <p>{selectedHaircut.barberNote}</p>
        {answers.boneMass ? <p className="bone-note">{boneMassNotes[answers.boneMass] || boneMassNotes.unknown}</p> : null}
        {analysis?.notes ? <p className="bone-note">{analysis.notes}</p> : null}
        <div className="answer-pills">
          {Object.entries(answers).map(([key, value]) => (
            value ? <span key={key}>{key === 'boneMass' ? 'Кость: ' : ''}{answerLabels[value] || value}</span> : null
          ))}
        </div>
      </section>

      <button className="primary-button wide" onClick={onRestart}>
        Новый подбор
        <RotateCcw size={18} />
      </button>

      {openedImage ? (
        <div className="image-modal" role="dialog" aria-modal="true" onClick={() => setOpenedImage(null)}>
          <div className="image-modal-card" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label="Закрыть фото" onClick={() => setOpenedImage(null)}>
              <X size={20} />
            </button>
            {showMannequin ? (
              <div className="modal-mannequin">
                <MannequinPreview haircutId={openedImage.id} faceShape={answers.faceShape} beard={answers.beard} label={openedImage.name} />
              </div>
            ) : (
              <ReferenceImage src={openedImage.image} fallbackSrc={openedImage.fallbackImage} alt={openedImage.name} />
            )}
            <div>
              <span className="caption">{showMannequin ? 'манекен' : angleLabels[openedImage.angle] || 'референс'}</span>
              <h3>{openedImage.name}</h3>
              <p>{openedImage.clientWhy}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);



