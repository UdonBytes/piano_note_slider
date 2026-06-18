"""Trim silence from the bundled PCM WAV note samples without dependencies."""

from __future__ import annotations

import math
import shutil
import sys
import wave
from pathlib import Path


# Easy-to-tune cleanup settings.
SILENCE_THRESHOLD_DB = -60.0
LEADING_PADDING_MS = 50
TRAILING_PADDING_MS = 1200
FADE_IN_MS = 8
FADE_OUT_MS = 200
MIN_DURATION_MS = 2000
ANALYSIS_WINDOW_MS = 5
ZERO_CROSSING_SEARCH_MS = 5

PROJECT_ROOT = Path(__file__).resolve().parents[1]
AUDIO_DIR = PROJECT_ROOT / "audio"
BACKUP_DIR = PROJECT_ROOT / "audio_original"


def decode_sample(data: bytes, offset: int, sample_width: int) -> int:
    sample = data[offset : offset + sample_width]
    if sample_width == 1:
        return sample[0] - 128  # 8-bit PCM WAV samples are unsigned.
    return int.from_bytes(sample, "little", signed=True)


def encode_sample(value: int, sample_width: int) -> bytes:
    if sample_width == 1:
        return bytes((max(0, min(255, value + 128)),))
    minimum = -(1 << (sample_width * 8 - 1))
    maximum = (1 << (sample_width * 8 - 1)) - 1
    value = max(minimum, min(maximum, value))
    return value.to_bytes(sample_width, "little", signed=True)


def window_rms(
    frames: bytes,
    start_frame: int,
    end_frame: int,
    channels: int,
    sample_width: int,
) -> float:
    frame_size = channels * sample_width
    total = 0
    count = 0
    for frame_index in range(start_frame, end_frame):
        frame_offset = frame_index * frame_size
        for channel in range(channels):
            value = decode_sample(frames, frame_offset + channel * sample_width, sample_width)
            total += value * value
            count += 1
    return math.sqrt(total / count) if count else 0.0


def remove_dc_offset(
    frames: bytes,
    channels: int,
    sample_width: int,
) -> bytes:
    """Center each channel around zero without normalizing its dynamics."""
    output = bytearray(frames)
    frame_size = channels * sample_width
    frame_count = len(output) // frame_size
    if frame_count == 0:
        return bytes(output)

    channel_totals = [0] * channels
    for frame_index in range(frame_count):
        frame_offset = frame_index * frame_size
        for channel in range(channels):
            offset = frame_offset + channel * sample_width
            channel_totals[channel] += decode_sample(output, offset, sample_width)
    offsets = [round(total / frame_count) for total in channel_totals]

    for frame_index in range(frame_count):
        frame_offset = frame_index * frame_size
        for channel in range(channels):
            offset = frame_offset + channel * sample_width
            value = decode_sample(output, offset, sample_width) - offsets[channel]
            output[offset : offset + sample_width] = encode_sample(value, sample_width)
    return bytes(output)


def nearest_zero_crossing(
    frames: bytes,
    target_frame: int,
    channels: int,
    sample_width: int,
    frame_rate: int,
) -> int:
    """Move a trim boundary a few milliseconds to the nearest zero crossing."""
    frame_size = channels * sample_width
    frame_count = len(frames) // frame_size
    search = max(1, round(frame_rate * ZERO_CROSSING_SEARCH_MS / 1000))
    lower = max(0, target_frame - search)
    upper = min(frame_count - 1, target_frame + search)

    crossings: list[int] = []
    for frame_index in range(lower, upper):
        current = decode_sample(frames, frame_index * frame_size, sample_width)
        following = decode_sample(frames, (frame_index + 1) * frame_size, sample_width)
        if current == 0 or (current < 0 <= following) or (current > 0 >= following):
            crossings.append(frame_index)
    if crossings:
        return min(crossings, key=lambda frame: abs(frame - target_frame))

    return min(
        range(lower, upper + 1),
        key=lambda frame: (
            abs(decode_sample(frames, frame * frame_size, sample_width)),
            abs(frame - target_frame),
        ),
    )


def active_frame_range(
    frames: bytes,
    channels: int,
    sample_width: int,
    frame_rate: int,
    silence_threshold_db: float = SILENCE_THRESHOLD_DB,
    leading_padding_ms: int = LEADING_PADDING_MS,
    trailing_padding_ms: int = TRAILING_PADDING_MS,
) -> tuple[int, int, int]:
    frame_size = channels * sample_width
    frame_count = len(frames) // frame_size
    window_size = max(1, round(frame_rate * ANALYSIS_WINDOW_MS / 1000))
    full_scale = (1 << (sample_width * 8 - 1)) - 1
    threshold = full_scale * (10 ** (silence_threshold_db / 20))

    active_windows: list[tuple[int, int]] = []
    for start in range(0, frame_count, window_size):
        end = min(frame_count, start + window_size)
        if window_rms(frames, start, end, channels, sample_width) >= threshold:
            active_windows.append((start, end))

    if not active_windows:
        return 0, frame_count, frame_count

    leading_padding = round(frame_rate * leading_padding_ms / 1000)
    trailing_padding = round(frame_rate * trailing_padding_ms / 1000)
    start = max(0, active_windows[0][0] - leading_padding)
    last_active_end = active_windows[-1][1]
    end = min(frame_count, last_active_end + trailing_padding)
    return start, end, last_active_end


def apply_fades(
    frames: bytes,
    channels: int,
    sample_width: int,
    frame_rate: int,
    fade_in_ms: int = FADE_IN_MS,
    fade_out_ms: int = FADE_OUT_MS,
) -> bytes:
    output = bytearray(frames)
    frame_size = channels * sample_width
    frame_count = len(output) // frame_size
    fade_in_frames = min(round(frame_rate * fade_in_ms / 1000), frame_count // 2)
    fade_out_frames = min(round(frame_rate * fade_out_ms / 1000), frame_count // 2)

    for frame_index in range(fade_in_frames):
        gain = frame_index / fade_in_frames
        frame_offset = frame_index * frame_size
        for channel in range(channels):
            offset = frame_offset + channel * sample_width
            value = decode_sample(output, offset, sample_width)
            output[offset : offset + sample_width] = encode_sample(round(value * gain), sample_width)

    for frame_index in range(fade_out_frames):
        # Walk backward from the final frame: the endpoint must be zero, then
        # gain increases smoothly as we move toward the start of the fade.
        gain = frame_index / fade_out_frames
        target_frame = frame_count - frame_index - 1
        frame_offset = target_frame * frame_size
        for channel in range(channels):
            offset = frame_offset + channel * sample_width
            value = decode_sample(output, offset, sample_width)
            output[offset : offset + sample_width] = encode_sample(round(value * gain), sample_width)
    return bytes(output)


def trim_wav(
    source_path: Path,
    destination_path: Path,
    *,
    silence_threshold_db: float = SILENCE_THRESHOLD_DB,
    leading_padding_ms: int = LEADING_PADDING_MS,
    trailing_padding_ms: int = TRAILING_PADDING_MS,
    fade_in_ms: int = FADE_IN_MS,
    fade_out_ms: int = FADE_OUT_MS,
    min_duration_ms: int = MIN_DURATION_MS,
) -> dict[str, float | str]:
    with wave.open(str(source_path), "rb") as source:
        if source.getcomptype() != "NONE":
            raise ValueError(f"{source_path.name} is not an uncompressed PCM WAV file")
        channels = source.getnchannels()
        sample_width = source.getsampwidth()
        frame_rate = source.getframerate()
        original_frame_count = source.getnframes()
        frames = source.readframes(original_frame_count)

    if sample_width not in (1, 2, 3, 4):
        raise ValueError(f"{source_path.name} uses unsupported {sample_width}-byte samples")

    frames = remove_dc_offset(frames, channels, sample_width)
    start, end, last_active_end = active_frame_range(
        frames,
        channels,
        sample_width,
        frame_rate,
        silence_threshold_db,
        leading_padding_ms,
        trailing_padding_ms,
    )
    start = nearest_zero_crossing(frames, start, channels, sample_width, frame_rate)
    minimum_frames = round(frame_rate * min_duration_ms / 1000)
    if end - start < minimum_frames:
        end = min(original_frame_count, start + minimum_frames)
    if end - start < minimum_frames:
        start = max(0, end - minimum_frames)
    frame_size = channels * sample_width
    cleaned = frames[start * frame_size : end * frame_size]
    cleaned = apply_fades(
        cleaned,
        channels,
        sample_width,
        frame_rate,
        fade_in_ms,
        fade_out_ms,
    )

    with wave.open(str(destination_path), "wb") as destination:
        destination.setnchannels(channels)
        destination.setsampwidth(sample_width)
        destination.setframerate(frame_rate)
        destination.setcomptype("NONE", "not compressed")
        destination.writeframes(cleaned)

    return {
        "filename": source_path.name,
        "original_seconds": original_frame_count / frame_rate,
        "cleaned_seconds": (end - start) / frame_rate,
        "trimmed_start_ms": start * 1000 / frame_rate,
        "retained_after_sound_ms": max(0, end - last_active_end) * 1000 / frame_rate,
        "fade_in_ms": fade_in_ms,
        "fade_out_ms": fade_out_ms,
    }


def create_backups(wav_files: list[Path]) -> None:
    if BACKUP_DIR.exists():
        missing = [path.name for path in wav_files if not (BACKUP_DIR / path.name).exists()]
        if missing:
            names = ", ".join(missing)
            raise RuntimeError(
                "audio_original already exists and will not be modified, but it is missing "
                f"these backups: {names}"
            )
        print("Using existing audio_original backups; no backup files were overwritten.")
        return

    BACKUP_DIR.mkdir()
    for path in wav_files:
        shutil.copy2(path, BACKUP_DIR / path.name)
    print(f"Backed up {len(wav_files)} files to {BACKUP_DIR.name}/.")


def main() -> None:
    wav_files = sorted(AUDIO_DIR.glob("*.wav"))
    if not wav_files:
        raise SystemExit(f"No WAV files found in {AUDIO_DIR}")

    create_backups(wav_files)
    # Always rebuild from the untouched backups so repeated runs never trim an
    # already-trimmed attack or tail.
    backup_files = sorted(BACKUP_DIR.glob("*.wav"))
    requested_names = set(sys.argv[1:])
    if requested_names:
        backup_files = [path for path in backup_files if path.name in requested_names]
        found_names = {path.name for path in backup_files}
        missing_names = requested_names - found_names
        if missing_names:
            raise SystemExit(f"Backup files not found: {', '.join(sorted(missing_names))}")

    reports = []
    for source_path in backup_files:
        destination_path = AUDIO_DIR / source_path.name
        reports.append(trim_wav(source_path, destination_path))

    def print_report_table(title: str, rows: list[dict[str, float | str]]) -> None:
        print(f"\n{title}")
        print(
            f"{'File':<8} {'Original':>9} {'Cleaned':>9} {'Start trim':>12} "
            f"{'Tail kept':>11} {'Fade in':>9} {'Fade out':>10}"
        )
        print("-" * 76)
        for report in rows:
            print(
                f"{report['filename']:<8} "
                f"{report['original_seconds']:>8.3f}s "
                f"{report['cleaned_seconds']:>8.3f}s "
                f"{report['trimmed_start_ms']:>10.1f}ms "
                f"{report['retained_after_sound_ms']:>9.1f}ms "
                f"{report['fade_in_ms']:>7.0f}ms "
                f"{report['fade_out_ms']:>8.0f}ms"
            )

    print_report_table("Audio cleanup report", reports)
    comparison_names = {"C4.wav", "D4.wav", "E4.wav", "F4.wav", "D5.wav", "F5.wav", "B5.wav", "C6.wav"}
    comparison_rows = [report for report in reports if report["filename"] in comparison_names]
    print_report_table("Requested comparison", comparison_rows)
    print(f"Cleaned {len(backup_files)} WAV files in {AUDIO_DIR.name}/.")


if __name__ == "__main__":
    main()
