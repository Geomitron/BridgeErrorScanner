/**
 * @returns `true` if `objects` is an array of objects that match the type of `template`.
 */
export function isObjectArray<T extends keyof typeof templates>(objects: unknown[], template: T): objects is (typeof templates[T])[] {
  return objects.every(object => isObject(object, template))
}

/**
 * @returns `true` if `object` is an object that matches the type of `template`.
 */
export function isObject<T extends keyof typeof templates>(object: unknown, template: T): object is typeof templates[T] {
  const exampleObject = templates[template]
  return typeof object == 'object' && object != null && Object.keys(exampleObject).every(key => {
    return key in object && typeof object[key as keyof typeof object] === typeof exampleObject[key as keyof typeof exampleObject]
  })
}


/**
 * Contains a list of example types so that Javascript is able to verify that other objects have this same structure.
 */
 const templates = {
  fileError: { errno: 0, code: '', path: '', syscall: '', name: '', message: '' } as NodeJS.ErrnoException,
  driveFileResponse: {
    id: '',
    name: '',
    mimeType: '',
    modifiedTime: '',
    capabilities: { canDownload: true },
    fullFileExtension: '',
    md5Checksum: '',
    size: '', // In bytes
  },
  driveFolderResponse: {
    id: '',
    name: '',
    mimeType: '',
    modifiedTime: '',
    capabilities: { canDownload: true }
  },
  shortcutDetails: {
    targetId: '',
    targetMimeType: ''
  },
  gaxiosError: {
    code: 0
  }
}

export type DriveFileResponse = typeof templates.driveFileResponse & { shortcutDetails?: typeof templates.shortcutDetails }
export type DriveShortcutResponse = typeof templates.driveFileResponse & { shortcutDetails: typeof templates.shortcutDetails }
export type DriveFolderResponse = typeof templates.driveFolderResponse
