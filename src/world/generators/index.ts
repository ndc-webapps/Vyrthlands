import { WorldGenerator, WorldType } from './types';
import { flatGenerator } from './flatGenerator';
import { naturalGenerator } from './naturalGenerator';
import { themeParkGenerator } from './themeParkGenerator';
import {
  prehistoricGenerator, warGenerator, zombieGenerator, medievalGenerator, cyberpunkGenerator,
  alienGenerator, skyIslandsGenerator, underworldGenerator, frozenGenerator, pirateGenerator,
  hauntedGenerator, wastelandGenerator, mythologyGenerator,
} from './themedGenerators';

export type { WorldGenerator, WorldType, GenContext } from './types';

export const GENERATORS: Record<WorldType, WorldGenerator> = {
  flat: flatGenerator,
  natural: naturalGenerator,
  prehistoric: prehistoricGenerator,
  battlefront: warGenerator,
  zombie: zombieGenerator,
  medieval: medievalGenerator,
  cyberpunk: cyberpunkGenerator,
  alien: alienGenerator,
  skyislands: skyIslandsGenerator,
  underworld: underworldGenerator,
  frozen: frozenGenerator,
  pirate: pirateGenerator,
  haunted: hauntedGenerator,
  wasteland: wastelandGenerator,
  mythology: mythologyGenerator,
  themepark: themeParkGenerator,
};
