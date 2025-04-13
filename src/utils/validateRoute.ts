import { allowedUrls } from '../allowedURLs'

export function validateRoute(url: string) {
    if (allowedUrls.includes(url)) {
        return true
    } else {

        return false
    }
}
