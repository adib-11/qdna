import { describe, expect, it, vi } from "vitest";
import { deliverFile } from "@/lib/corpus/deliver";

const file = new File(["{}"], "corpus.qdna.json", { type: "application/json" });

describe("delivering an exported corpus file", () => {
  it("opens the share sheet where the device can share files", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const download = vi.fn();

    const outcome = await deliverFile(file, { canShare: () => true, share }, download);

    expect(outcome).toBe("shared");
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: [file] }));
    expect(download).not.toHaveBeenCalled();
  });

  it("downloads the file where the Web Share API is missing", async () => {
    const download = vi.fn();

    expect(await deliverFile(file, {}, download)).toBe("downloaded");
    expect(download).toHaveBeenCalledWith(file);
  });

  it("downloads the file where the device cannot share files", async () => {
    const share = vi.fn();
    const download = vi.fn();

    const outcome = await deliverFile(file, { canShare: () => false, share }, download);

    expect(outcome).toBe("downloaded");
    expect(share).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledWith(file);
  });

  it("does nothing more when the student dismisses the share sheet", async () => {
    const abort = new DOMException("Share canceled", "AbortError");
    const download = vi.fn();

    const outcome = await deliverFile(
      file,
      { canShare: () => true, share: vi.fn().mockRejectedValue(abort) },
      download,
    );

    expect(outcome).toBe("cancelled");
    expect(download).not.toHaveBeenCalled();
  });

  it("falls back to a download when sharing fails for another reason", async () => {
    const denied = new DOMException("Not allowed", "NotAllowedError");
    const download = vi.fn();

    const outcome = await deliverFile(
      file,
      { canShare: () => true, share: vi.fn().mockRejectedValue(denied) },
      download,
    );

    expect(outcome).toBe("downloaded");
    expect(download).toHaveBeenCalledWith(file);
  });
});
