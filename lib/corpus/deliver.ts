/** The parts of `navigator` that file sharing needs; both are absent on many desktops. */
export interface ShareTarget {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
}

export type Delivery = "shared" | "downloaded" | "cancelled";

/**
 * Hand a file to the student: the share sheet where the device can share
 * files (straight into Messenger or WhatsApp on a phone), a download anywhere
 * else. Dismissing the share sheet is a choice, not a failure, so it does not
 * fall through to a download.
 */
export async function deliverFile(
  file: File,
  target: ShareTarget,
  download: (file: File) => void,
): Promise<Delivery> {
  const data: ShareData = { files: [file], title: file.name };

  if (target.share && target.canShare?.(data)) {
    try {
      await target.share(data);
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "cancelled";
      }
    }
  }

  download(file);
  return "downloaded";
}

/** Save a file through a temporary object URL. Browser only. */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next tick so the click has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
