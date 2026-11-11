import {
  ANNOTATION_KINDS,
  ENTITY_KINDS,
  INTERPOLATION_MODES,
  isTick,
  MAP_MAX_DIMENSION,
  SCALE_UNITS,
  type Entity,
  type MapAnnotation,
  type MapLink,
  type MapToken,
  type TokenKeyframe,
  type World,
  type WorldEvent,
  type WorldMap,
} from '@domain/models';
import { AppError } from '@domain/ports';

/**
 * Os `check` do DDL do docs/07, para o modo local recusar o mesmo que o banco recusaria
 * (`AppError('validation')`). Ao mudar um check numa migração, mude aqui também.
 */

function fail(message: string): never {
  throw new AppError('validation', message);
}

/** `char_length` conta caracteres, não unidades UTF-16. */
function charLength(value: string): number {
  return [...value].length;
}

function checkText(value: string | null, field: string, max: number, min = 0): void {
  if (value === null) {
    if (min > 0) fail(`${field} é obrigatório`);
    return;
  }
  const length = charLength(value);
  if (length < min || length > max) fail(`${field} deve ter entre ${min} e ${max} caracteres`);
}

function checkTick(value: number | null, field: string): void {
  if (value !== null && !isTick(value)) fail(`${field} deve ser um tick inteiro`);
}

function checkTickRange(start: number | null, end: number | null, field: string): void {
  checkTick(start, `${field}: início`);
  checkTick(end, `${field}: fim`);
  if (start !== null && end !== null && end < start) fail(`${field}: o fim vem antes do início`);
}

function checkColor(value: string | null): void {
  if (value !== null && !/^#[0-9a-fA-F]{6}$/.test(value)) fail('cor deve estar no formato #rrggbb');
}

function checkOneOf<T>(value: T, allowed: readonly T[], field: string): void {
  if (!allowed.includes(value)) fail(`${field} inválido: ${String(value)}`);
}

export function checkWorld(world: World): void {
  checkText(world.name, 'nome', 120, 1);
  checkText(world.description, 'descrição', 2000);
  checkTick(world.timeStart, 'início do tempo');
  checkTick(world.timeEnd, 'fim do tempo');
  checkTick(world.nowTick, 'agora da narrativa');
  if (world.timeEnd <= world.timeStart) fail('o fim do tempo deve vir depois do início');
}

export function checkMap(map: WorldMap): void {
  checkText(map.name, 'nome', 120, 1);
  for (const [field, value] of [
    ['largura', map.width],
    ['altura', map.height],
  ] as const) {
    if (!Number.isInteger(value) || value < 1 || value > MAP_MAX_DIMENSION) {
      fail(`${field} deve ser um inteiro entre 1 e ${MAP_MAX_DIMENSION}`);
    }
  }
  if (map.scaleValue !== null && !(map.scaleValue > 0)) fail('a escala deve ser positiva');
  if (map.scaleUnit !== null) checkOneOf(map.scaleUnit, SCALE_UNITS, 'unidade da escala');
  if (map.parentMapId === map.id) fail('um mapa não pode ser filho de si mesmo');
}

export function checkLink(link: MapLink): void {
  if (link.mapId === link.targetMapId) fail('o vínculo deve apontar para outro mapa');
}

export function checkEntity(entity: Entity): void {
  checkOneOf(entity.kind, ENTITY_KINDS, 'tipo');
  checkText(entity.name, 'nome', 160, 1);
  checkText(entity.subtitle, 'subtítulo', 200);
  checkColor(entity.color);
  checkText(entity.contentText, 'texto', 500_000);
  checkTick(entity.bornTick, 'nascimento');
  checkTick(entity.diedTick, 'morte');
}

export function checkEvent(event: WorldEvent): void {
  checkText(event.title, 'título', 200, 1);
  checkColor(event.color);
  checkText(event.contentText, 'texto', 200_000);
  checkTick(event.tickStart, 'início');
  checkTickRange(event.tickStart, event.tickEnd, 'evento');
}

export function checkToken(token: MapToken): void {
  if ((token.entityId === null) === (token.eventId === null)) {
    fail('o token deve marcar exatamente uma entidade ou um evento');
  }
  if (!(token.size >= 0.1 && token.size <= 10)) fail('o tamanho deve ficar entre 0,1 e 10');
}

export function checkKeyframe(keyframe: TokenKeyframe): void {
  if (!isTick(keyframe.tick)) fail('tick deve ser um inteiro');
  if (!Number.isFinite(keyframe.x) || !Number.isFinite(keyframe.y)) fail('posição inválida');
  checkOneOf(keyframe.interpolation, INTERPOLATION_MODES, 'interpolação');
  checkText(keyframe.note, 'nota', 500);
}

export function checkAnnotation(annotation: MapAnnotation): void {
  checkOneOf(annotation.kind, ANNOTATION_KINDS, 'tipo');
  checkText(annotation.title, 'título', 160);
  checkTickRange(annotation.tickStart, annotation.tickEnd, 'validade');
  if (!Number.isInteger(annotation.zIndex)) fail('a ordem deve ser um inteiro');
}
