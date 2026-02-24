export const LOCAL_STORAGE = {
  COLOR: 'todo_color',
} as const

export const DIALOG_TYPE = {
  ERROR: 'error',
  ALERT: 'alert',
  INFO: 'info',
} as const

export const RESPONSE_TYPE = {
  OK: 'close',
  CANCEL: 'cancel',
} as const

export const BUTTON_TYPE = {
  PRIMARY: 'primary',
  SECONDARY: 'secondary',
  TERTIARY: 'tertiary',
} as const

export const BUTTON_SIZE = {
  SHORT: 'short',
  LONG: 'long',
} as const

export const CATEGORY_TYPE = {
  DATED: 'dated',
  PLAIN: 'plain',
} as const

export type CategoryType = (typeof CATEGORY_TYPE)[keyof typeof CATEGORY_TYPE]

export const COLOR_TYPE = {
  primary: 'primary',
  primaryHeavy: 'primaryHeavy',
  secondary: 'secondary',
  secondaryHeavy: 'secondaryHeavy',
  background: 'background',
  error: 'error',
  onPrimary: 'onPrimary',
  onPrimaryHeavy: 'onPrimaryHeavy',
  onSecondary: 'onSecondary',
  onSecondaryHeavy: 'onSecondaryHeavy',
  onBackground: 'onBackground',
  onError: 'onError',
  gray: 'gray',
} as const

export const COLOR_INFO: {
  [id: string]: {
    id: string
    name: string
    color: {
      primary: string
      primaryHeavy: string
      secondary: string
      secondaryHeavy: string
      background: string
      error: string
      onPrimary: string
      onPrimaryHeavy: string
      onSecondary: string
      onSecondaryHeavy: string
      onBackground: string
      onError: string
      gray: string
    }
  }
} = {
  sky: {
    id: 'sky',
    name: 'Sky',
    color: {
      primary: '#E1F5FE',
      primaryHeavy: '#B3E5FC',
      secondary: '#E0F7FA',
      secondaryHeavy: '#B2EBF2',
      background: '#FFFFFF',
      error: '#C62828',
      onPrimary: '#102027',
      onPrimaryHeavy: '#102027',
      onSecondary: '#102027',
      onSecondaryHeavy: '#102027',
      onBackground: '#102027',
      onError: '#FFFFFF',
      gray: '#8A8A8A',
    },
  },
  light: {
    id: 'light',
    name: 'Light',
    color: {
      primary: '#ECEFF1',
      primaryHeavy: '#B0BEC5',
      secondary: '#EFEBE9',
      secondaryHeavy: '#D7CCC8',
      background: '#FFFFFF',
      error: '#C62828',
      onPrimary: '#263238',
      onPrimaryHeavy: '#263238',
      onSecondary: '#263238',
      onSecondaryHeavy: '#263238',
      onBackground: '#263238',
      onError: '#FFFFFF',
      gray: '#8A8A8A',
    },
  },
  dark: {
    id: 'dark',
    name: 'Dark',
    color: {
      primary: '#263238',
      primaryHeavy: '#37474F',
      secondary: '#212121',
      secondaryHeavy: '#424242',
      background: '#121212',
      error: '#EF5350',
      onPrimary: '#FFFFFF',
      onPrimaryHeavy: '#FFFFFF',
      onSecondary: '#FFFFFF',
      onSecondaryHeavy: '#FFFFFF',
      onBackground: '#FFFFFF',
      onError: '#121212',
      gray: '#9E9E9E',
    },
  },
}
