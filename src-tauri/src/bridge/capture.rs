//! System-audio capture for the AI karaoke pipeline.
//!
//! Records the default render endpoint via WASAPI **loopback** (post-decode
//! system audio — no DRM circumvention; the capture is local and temporary) and
//! returns a 16-bit PCM WAV buffer. Only Windows is supported; other platforms
//! degrade gracefully.

/// Bounds on a requested capture window. Long enough to align a few lines,
/// short enough that the request stays quick and the payload stays small.
pub const MIN_CAPTURE_MS: u32 = 1_000;
pub const MAX_CAPTURE_MS: u32 = 60_000;

/// Clamps a requested capture duration into `[MIN_CAPTURE_MS, MAX_CAPTURE_MS]`.
/// Non-positive or oversized requests are clamped rather than rejected.
pub fn clamp_duration_ms(requested: i64) -> u32 {
    requested.clamp(MIN_CAPTURE_MS as i64, MAX_CAPTURE_MS as i64) as u32
}

/// Sample format of the captured stream, normalized from the WASAPI mix format.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SampleFormat {
    Pcm16,
    Pcm32,
    F32,
}

/// Converts a float sample in `[-1.0, 1.0]` to a 16-bit PCM sample.
pub fn f32_to_i16(sample: f32) -> i16 {
    (sample.clamp(-1.0, 1.0) * i16::MAX as f32).round() as i16
}

/// Converts raw interleaved capture bytes into 16-bit PCM samples.
pub fn bytes_to_i16(bytes: &[u8], format: SampleFormat) -> Vec<i16> {
    match format {
        SampleFormat::Pcm16 => bytes
            .as_chunks::<2>()
            .0
            .iter()
            .map(|c| i16::from_le_bytes(*c))
            .collect(),
        SampleFormat::Pcm32 => bytes
            .as_chunks::<4>()
            .0
            .iter()
            .map(|c| (i32::from_le_bytes(*c) >> 16) as i16)
            .collect(),
        SampleFormat::F32 => bytes
            .as_chunks::<4>()
            .0
            .iter()
            .map(|c| f32_to_i16(f32::from_le_bytes(*c)))
            .collect(),
    }
}

/// Encodes 16-bit PCM samples as a canonical 44-byte-header RIFF/WAVE file.
pub fn encode_wav(sample_rate: u32, channels: u16, samples: &[i16]) -> Vec<u8> {
    const BITS_PER_SAMPLE: u16 = 16;
    let block_align = channels.saturating_mul(BITS_PER_SAMPLE / 8);
    let byte_rate = sample_rate.saturating_mul(block_align as u32);
    let data_len = (samples.len() as u32).saturating_mul(2);

    let mut out = Vec::with_capacity(44 + data_len as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len).to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes()); // fmt chunk size
    out.extend_from_slice(&1u16.to_le_bytes()); // WAVE_FORMAT_PCM
    out.extend_from_slice(&channels.to_le_bytes());
    out.extend_from_slice(&sample_rate.to_le_bytes());
    out.extend_from_slice(&byte_rate.to_le_bytes());
    out.extend_from_slice(&block_align.to_le_bytes());
    out.extend_from_slice(&BITS_PER_SAMPLE.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    for sample in samples {
        out.extend_from_slice(&sample.to_le_bytes());
    }
    out
}

/// Records the default render endpoint for `duration_ms` and returns a WAV
/// buffer. Windows-only; fails cleanly elsewhere.
#[cfg(target_os = "windows")]
pub fn capture_loopback(duration_ms: u32) -> Result<Vec<u8>, String> {
    windows::capture_loopback(duration_ms)
}

#[cfg(not(target_os = "windows"))]
pub fn capture_loopback(_duration_ms: u32) -> Result<Vec<u8>, String> {
    Err("audio capture is only supported on Windows".to_string())
}

#[cfg(target_os = "windows")]
mod windows {
    use std::time::{Duration, Instant};

    use ::windows::Win32::Media::Audio::{
        AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK,
        IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator, MMDeviceEnumerator, WAVEFORMATEX,
        WAVEFORMATEXTENSIBLE, eConsole, eRender,
    };
    use ::windows::Win32::System::Com::{
        CLSCTX_ALL, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, CoTaskMemFree,
    };

    use super::{SampleFormat, bytes_to_i16, encode_wav};

    const WAVE_FORMAT_PCM: u32 = 1;
    const WAVE_FORMAT_IEEE_FLOAT: u32 = 3;
    const WAVE_FORMAT_EXTENSIBLE: u32 = 0xFFFE;

    /// 100-nanosecond units for the shared-mode buffer duration (1 second).
    const HNS_BUFFER_DURATION: i64 = 10_000_000;

    struct MixFormat {
        sample_rate: u32,
        channels: u16,
        block_align: usize,
        format: SampleFormat,
    }

    /// Reads the WASAPI mix format, isolating the fields capture needs. For an
    /// extensible format the sub-format GUID's first field selects PCM vs float.
    unsafe fn read_mix_format(raw: *const WAVEFORMATEX) -> Result<MixFormat, String> {
        let base = unsafe { *raw };
        let tag = base.wFormatTag as u32;
        let format = match tag {
            WAVE_FORMAT_PCM => SampleFormat::Pcm16,
            WAVE_FORMAT_IEEE_FLOAT => SampleFormat::F32,
            WAVE_FORMAT_EXTENSIBLE => {
                let ext = unsafe { &*(raw as *const WAVEFORMATEXTENSIBLE) };
                match ext.SubFormat.data1 {
                    WAVE_FORMAT_IEEE_FLOAT => SampleFormat::F32,
                    _ => SampleFormat::Pcm16,
                }
            }
            _ => return Err(format!("unsupported mix format tag {tag}")),
        };

        // Widen the tag-specific choice to the actual bit depth for PCM.
        let format = match (format, base.wBitsPerSample) {
            (SampleFormat::Pcm16, 32) => SampleFormat::Pcm32,
            (other, _) => other,
        };

        Ok(MixFormat {
            sample_rate: base.nSamplesPerSec,
            channels: base.nChannels,
            block_align: base.nBlockAlign as usize,
            format,
        })
    }

    pub fn capture_loopback(duration_ms: u32) -> Result<Vec<u8>, String> {
        unsafe {
            // Best-effort MTA init; a background thread may already be initialized.
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .map_err(|e| format!("enumerator init failed: {e}"))?;
            let device = enumerator
                .GetDefaultAudioEndpoint(eRender, eConsole)
                .map_err(|e| format!("no default render endpoint: {e}"))?;
            let client: IAudioClient = device
                .Activate(CLSCTX_ALL, None)
                .map_err(|e| format!("audio client activation failed: {e}"))?;

            let raw_format = client
                .GetMixFormat()
                .map_err(|e| format!("GetMixFormat failed: {e}"))?;
            let mix = match read_mix_format(raw_format) {
                Ok(mix) => mix,
                Err(error) => {
                    CoTaskMemFree(Some(raw_format as *const core::ffi::c_void));
                    return Err(error);
                }
            };

            let init = client.Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK,
                HNS_BUFFER_DURATION,
                0,
                raw_format,
                None,
            );
            CoTaskMemFree(Some(raw_format as *const core::ffi::c_void));
            init.map_err(|e| format!("audio client init failed: {e}"))?;

            let capture: IAudioCaptureClient = client
                .GetService()
                .map_err(|e| format!("capture service unavailable: {e}"))?;

            client
                .Start()
                .map_err(|e| format!("audio client start failed: {e}"))?;

            let mut bytes: Vec<u8> = Vec::new();
            let deadline = Instant::now() + Duration::from_millis(duration_ms as u64);
            while Instant::now() < deadline {
                let mut packet = capture
                    .GetNextPacketSize()
                    .map_err(|e| format!("capture poll failed: {e}"))?;
                while packet > 0 {
                    let mut data: *mut u8 = std::ptr::null_mut();
                    let mut frames: u32 = 0;
                    let mut flags: u32 = 0;
                    capture
                        .GetBuffer(&mut data, &mut frames, &mut flags, None, None)
                        .map_err(|e| format!("capture read failed: {e}"))?;

                    if frames > 0 && (flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32) == 0 {
                        let len = frames as usize * mix.block_align;
                        let slice = std::slice::from_raw_parts(data, len);
                        bytes.extend_from_slice(slice);
                    }
                    let _ = capture.ReleaseBuffer(frames);
                    packet = capture
                        .GetNextPacketSize()
                        .map_err(|e| format!("capture poll failed: {e}"))?;
                }
                std::thread::sleep(Duration::from_millis(5));
            }

            let _ = client.Stop();

            let samples = bytes_to_i16(&bytes, mix.format);
            Ok(encode_wav(mix.sample_rate, mix.channels, &samples))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamp_bounds_the_requested_duration() {
        assert_eq!(clamp_duration_ms(0), MIN_CAPTURE_MS);
        assert_eq!(clamp_duration_ms(-100), MIN_CAPTURE_MS);
        assert_eq!(clamp_duration_ms(500), MIN_CAPTURE_MS);
        assert_eq!(clamp_duration_ms(15_000), 15_000);
        assert_eq!(clamp_duration_ms(1_000_000), MAX_CAPTURE_MS);
    }

    #[test]
    fn f32_to_i16_clamps_and_scales() {
        assert_eq!(f32_to_i16(0.0), 0);
        assert_eq!(f32_to_i16(1.0), i16::MAX);
        assert_eq!(f32_to_i16(-1.0), -i16::MAX);
        assert_eq!(f32_to_i16(2.0), i16::MAX);
        assert_eq!(f32_to_i16(-2.0), -i16::MAX);
    }

    #[test]
    fn bytes_to_i16_decodes_each_format() {
        assert_eq!(
            bytes_to_i16(&[0x01, 0x00, 0xFF, 0xFF], SampleFormat::Pcm16),
            vec![1, -1]
        );
        // 0x4000_0000 >> 16 == 0x4000 (16384)
        assert_eq!(
            bytes_to_i16(&[0x00, 0x00, 0x00, 0x40], SampleFormat::Pcm32),
            vec![16_384]
        );
        let half = bytes_to_i16(&0.5f32.to_le_bytes(), SampleFormat::F32);
        assert_eq!(half, vec![16_384]);
        // Trailing partial bytes are ignored by as_chunks.
        assert_eq!(
            bytes_to_i16(&[0x01], SampleFormat::Pcm16),
            Vec::<i16>::new()
        );
    }

    #[test]
    fn encode_wav_writes_a_valid_pcm_header() {
        let wav = encode_wav(44_100, 2, &[0, 1, -1]);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(&wav[12..16], b"fmt ");
        assert_eq!(&wav[36..40], b"data");
        // data length = 3 samples * 2 bytes
        assert_eq!(u32::from_le_bytes(wav[40..44].try_into().unwrap()), 6);
        // RIFF size = 36 + data length
        assert_eq!(u32::from_le_bytes(wav[4..8].try_into().unwrap()), 42);
        assert_eq!(wav.len(), 44 + 6);
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn capture_is_unsupported_off_windows() {
        assert!(capture_loopback(1_000).is_err());
    }
}
