import type { CalendarUnit } from '@domain/calendar/calendar-definition';
import type { PlaySpeed, SpeedUnit } from '@domain/timeline';

const SPEED_UNIT_NAMES: Record<SpeedUnit, { one: string; many: string }> = {
  day: { one: 'dia', many: 'dias' },
  month: { one: 'mês', many: 'meses' },
  year: { one: 'ano', many: 'anos' },
};

/** "1 ano/s", "1.000 anos/s", "2,5 meses/s". */
function formatSpeed({ amount, unit }: PlaySpeed): string {
  const name = SPEED_UNIT_NAMES[unit];
  return `${amount.toLocaleString('pt-BR')} ${amount === 1 ? name.one : name.many}/s`;
}

/** Duração legível: "45 s", "3 min 20 s", "2 h 5 min", "3 dias". */
function formatDuration(seconds: number): string {
  if (seconds < 1) return 'menos de 1 s';
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  return `${Math.round(h / 24).toLocaleString('pt-BR')} dias`;
}

/** Textos da linha do tempo, do editor de calendário e dos eventos (M3). */
export const TIME_STRINGS = {
  timeline: {
    region: 'Linha do tempo',
    cursor: 'Instante atual',
    instructions:
      'Setas mudam a data (Shift: passo maior). Page Up e Page Down vão ao evento anterior e ao seguinte. ' +
      'Home e End vão ao início e ao fim do mundo. + e − aproximam e afastam; 0 mostra tudo. Espaço reproduz.',
    play: 'Reproduzir',
    pause: 'Pausar',
    speed: (value: string) => `Velocidade do play: ${value}. Clique para configurar.`,
    formatSpeed,
    loop: 'Repetir ao chegar ao fim',
    showAll: 'Mostrar o mundo inteiro',
    newEvent: 'Novo evento nesta data',
    calendar: 'Calendário e faixa do mundo',
    eventsHere: (titles: string) => `Eventos: ${titles}`,
    units: {
      minute: 'minuto',
      hour: 'hora',
      day: 'dia',
      month: 'mês',
      year: 'ano',
    } satisfies Record<CalendarUnit, string>,
  },
  speed: {
    title: 'Velocidade do play',
    presets: 'Atalhos',
    custom: 'Personalizada',
    amount: 'Quantidade',
    unit: 'Unidade',
    perSecond: 'por segundo',
    units: { day: 'dias', month: 'meses', year: 'anos' } satisfies Record<SpeedUnit, string>,
    invalid: (min: string, max: string) => `Use um número entre ${min} e ${max}.`,
    duration: (time: string) => `Percorre o mundo inteiro em ${time}.`,
    formatDuration,
    cancel: 'Cancelar',
    apply: 'Aplicar',
  },
  date: {
    day: 'Dia',
    month: 'Mês',
    year: 'Ano',
    era: 'Era',
    hour: 'Hora',
    minute: 'Minuto',
    time: 'Hora do dia',
    invalid: 'Esta data não existe no calendário.',
  },
  calendar: {
    title: 'Calendário do mundo',
    tabsLabel: 'Seções do calendário',
    tabs: { months: 'Meses e dias', eras: 'Eras e formato', range: 'Faixa do mundo' },
    months: 'Meses',
    monthName: (n: number) => `Nome do mês ${n}`,
    monthDays: (n: number) => `Dias do mês ${n}`,
    addMonth: 'Acrescentar mês',
    weekdays: 'Dias da semana',
    weekdayName: (n: number) => `Nome do dia ${n} da semana`,
    addWeekday: 'Acrescentar dia da semana',
    weekdaysHint: 'Deixe sem dias para um calendário sem semana. O dia da época é o primeiro.',
    remove: (name: string) => `Remover "${name}"`,
    moveUp: (name: string) => `Subir "${name}"`,
    moveDown: (name: string) => `Descer "${name}"`,
    hoursPerDay: 'Horas por dia',
    minutesPerHour: 'Minutos por hora',
    leap: 'Anos bissextos',
    leapEvery: 'A cada (anos)',
    leapMonth: 'Mês que ganha dias',
    leapDays: 'Dias a mais',
    eras: 'Eras',
    eraName: (n: number) => `Nome da era ${n}`,
    eraAbbr: (n: number) => `Abreviatura da era ${n}`,
    eraStart: (n: number) => `Ano de início da era ${n}`,
    eraBackward: 'Contagem regressiva (como "a.C.")',
    addEra: 'Acrescentar era',
    erasHint:
      'O ano de início é contado a partir da época (ano 0). A primeira era também cobre os anos anteriores.',
    epochLabel: 'Nome da época (ano 0)',
    format: 'Modelo da data',
    formatHint:
      'Use {day}, {month}, {monthNumber}, {year}, {era}, {eraName}, {weekday}, {hour} e {minute}.',
    preview: 'Prévia',
    previewToday: (date: string) => `Instante atual: ${date}`,
    previewEpoch: (date: string) => `Época: ${date}`,
    rangeStart: 'Início do mundo',
    rangeEnd: 'Fim do mundo',
    rangeHint: 'O trilho da linha do tempo vai do início ao fim do mundo.',
    now: 'Agora da narrativa',
    nowHint: 'Ponto atual da história, marcado no trilho. Opcional.',
    hasNow: 'Marcar o agora da narrativa',
    rangeInvalid: 'O fim precisa vir depois do início.',
    newMonth: 'Novo mês',
    newWeekday: 'Novo dia',
    newEra: 'Nova era',
    cancel: 'Cancelar',
    save: 'Salvar',
    saved: 'Calendário salvo.',
    failed: 'Não foi possível salvar o calendário.',
    invalid: 'Corrija os campos marcados antes de salvar.',
    issues: {
      required: 'Preencha este campo.',
      number: 'Use um número inteiro dentro do limite.',
      leapMonth: 'O mês bissexto não existe no calendário.',
      eraOrder: 'As eras devem estar em ordem crescente de início.',
      eraBackward: 'Uma era com contagem regressiva precisa de uma era seguinte.',
      generic: 'Valor inválido.',
    },
  },
  events: {
    categories: {
      general: 'Geral',
      battle: 'Batalha',
      birth: 'Nascimento',
      death: 'Morte',
      travel: 'Viagem',
      politics: 'Política',
      founding: 'Fundação',
      discovery: 'Descoberta',
      disaster: 'Catástrofe',
      celebration: 'Celebração',
    } as Record<string, string>,
    otherCategory: (id: string) => id,
    kind: 'Evento',
    create: {
      title: 'Novo evento',
      name: 'Título',
      when: (date: string) => `Começa em ${date}. A data pode ser mudada na ficha.`,
      submit: 'Criar',
      cancel: 'Cancelar',
      required: 'Dê um título.',
      tooLong: (max: number) => `Use no máximo ${max} caracteres.`,
      created: (title: string) => `Evento "${title}" criado.`,
      failed: 'Não foi possível criar o evento.',
    },
    sheet: {
      label: (title: string) => `Evento: ${title}`,
      title: 'Título',
      start: 'Início',
      end: 'Fim',
      hasEnd: 'Tem duração',
      endBeforeStart: 'O fim precisa vir depois do início.',
      goTo: 'Ir para esta data',
      category: 'Categoria',
      location: 'Local',
      noLocation: 'Nenhum',
      locationHint: 'Quando o local tiver posição no mapa, o evento aparece lá.',
      color: 'Cor do marcador',
      defaultColor: 'Cor da categoria',
      onMap: 'No mapa',
      notOnMap: 'Ainda não está no mapa aberto.',
      placedOnMap: (map: string) => `Marcado em "${map}".`,
      noMap: 'Abra um mapa para marcar o evento.',
      place: 'Marcar no mapa',
      move: 'Mudar o ponto',
      show: 'Mostrar no mapa',
      unplace: 'Tirar do mapa',
      trash: 'Mover para a lixeira',
    },
    place: {
      hint: (title: string) =>
        `Clique no mapa para marcar "${title}". Enter marca no centro; Esc cancela.`,
      placed: (title: string) => `"${title}" marcado no mapa.`,
      removed: (title: string) => `"${title}" saiu do mapa.`,
      failed: 'Não foi possível marcar o evento no mapa.',
    },
    range: {
      title: 'Ampliar a linha do tempo?',
      message: (date: string) =>
        `${date} fica fora da faixa do mundo. Ampliar a faixa para incluir o evento?`,
      confirm: 'Ampliar',
      cancel: 'Agora não',
      failed: 'Não foi possível ampliar a faixa do mundo.',
    },
    popover: {
      open: 'Abrir ficha',
      goTo: 'Ir para a data',
      until: (date: string) => `até ${date}`,
    },
    map: {
      list: 'Eventos visíveis no mapa',
      open: (title: string) => `Abrir evento: ${title}`,
    },
  },
} as const;
