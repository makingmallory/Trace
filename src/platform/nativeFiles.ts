import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { isNativeAndroid } from './nativeRuntime.ts'

export async function shareTextFile(fileName: string, contents: string): Promise<boolean> {
  if (!isNativeAndroid()) return false
  const written = await Filesystem.writeFile({
    path: fileName,
    data: contents,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  })
  await Share.share({
    title: 'Export Trace Data',
    text: 'Trace portable backup',
    files: [written.uri],
    dialogTitle: 'Save or share Trace backup',
  })
  return true
}
