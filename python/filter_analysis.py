"""
PyFDA Web — Filter Analysis Functions
Frequency response, group delay, phase delay, impulse/step/stimulus + FFT, P/Z, 3D surface,
and spec-vs-actual performance verification.
"""
import numpy as np
from scipy import signal


def freq_response(b, a, fs=48000, n_points=2048, **kwargs):
    """Compute magnitude, real/imag, and phase frequency response."""
    b = np.array(b, dtype=float)
    a = np.array(a, dtype=float)
    fs = float(fs) if fs else 48000.0
    w, h = signal.freqz(b, a, worN=n_points, fs=fs)

    mag = np.abs(h)
    mag_db = 20.0 * np.log10(np.maximum(mag, 1e-15))
    phase_rad = np.unwrap(np.angle(h))
    phase_deg = np.degrees(phase_rad)

    return {
        'freq': w.tolist(),
        'mag': mag.tolist(),
        'mag_db': mag_db.tolist(),
        'h_real': np.real(h).tolist(),
        'h_imag': np.imag(h).tolist(),
        'phase_rad': phase_rad.tolist(),
        'phase_deg': phase_deg.tolist(),
    }


def group_delay_analysis(b, a, fs=48000, n_points=2048, **kwargs):
    """Compute group delay."""
    b = np.array(b, dtype=float)
    a = np.array(a, dtype=float)
    fs = float(fs) if fs else 48000.0
    w, gd = signal.group_delay((b, a), w=n_points, fs=fs)
    return {
        'freq': w.tolist(),
        'group_delay': gd.tolist(),
    }


def phase_delay(b, a, fs=48000, n_points=2048, **kwargs):
    """Compute phase delay: -phase(w) / w."""
    b = np.array(b, dtype=float)
    a = np.array(a, dtype=float)
    fs = float(fs) if fs else 48000.0
    w, h = signal.freqz(b, a, worN=n_points, fs=fs)

    phase = np.unwrap(np.angle(h))
    omega = 2.0 * np.pi * w / fs
    pd = np.zeros_like(phase)
    mask = omega > 1e-10
    pd[mask] = -phase[mask] / omega[mask]

    return {
        'freq': w.tolist(),
        'phase_delay': pd.tolist(),
    }


def impulse_response(b, a, n_samples=256, **kwargs):
    """Compute impulse response h[n]."""
    b = np.array(b, dtype=float)
    a = np.array(a, dtype=float)
    impulse = np.zeros(int(n_samples))
    impulse[0] = 1.0
    h = signal.lfilter(b, a, impulse)
    return {
        'n': list(range(int(n_samples))),
        'h': h.tolist(),
    }


def step_response(b, a, n_samples=256, **kwargs):
    """Compute step response."""
    b = np.array(b, dtype=float)
    a = np.array(a, dtype=float)
    step_input = np.ones(int(n_samples))
    s = signal.lfilter(b, a, step_input)
    return {
        'n': list(range(int(n_samples))),
        's': s.tolist(),
    }


def _build_preset_stimulus(stim_type='custom', stim_expr='sin(2*pi*n*1000/fs)',
                           fs=48000.0, n_samples=256, amp=1.0, freq1=1000.0,
                           phi1_deg=0.0, dc=0.0, noise_type='none', noise_std=0.0,
                           bandlimit=False):
    """Generate stimulus vector x[n] matching pyfda's PlotTranStim waveforms + custom expr."""
    n = np.arange(int(n_samples), dtype=float)
    fs = float(fs) if fs else 48000.0
    st = str(stim_type or 'custom').lower()

    if st == 'custom':
        allowed_funcs = {
            'sin': np.sin, 'cos': np.cos, 'tan': np.tan,
            'abs': np.abs, 'sqrt': np.sqrt, 'exp': np.exp,
            'log': np.log, 'log10': np.log10,
            'pi': np.pi, 'n': n, 'fs': fs,
            'sign': np.sign, 'heaviside': np.heaviside,
            'sinc': np.sinc, 'floor': np.floor, 'ceil': np.ceil,
        }
        x = eval(stim_expr, {"__builtins__": {}}, allowed_funcs)
        if isinstance(x, (int, float)):
            x = np.full(int(n_samples), float(x))
        x = np.asarray(x, dtype=float)
    else:
        f_norm = float(freq1) / fs
        phi = np.deg2rad(float(phi1_deg))
        a1 = float(amp)
        if st == 'impulse':
            x = np.zeros(int(n_samples), dtype=float)
            x[0] = a1
        elif st == 'step':
            x = np.full(int(n_samples), a1, dtype=float)
        elif st == 'sine':
            x = a1 * np.sin(2.0 * np.pi * f_norm * n + phi)
        elif st == 'rect':
            if bandlimit and f_norm > 0:
                x = np.zeros(int(n_samples), dtype=float)
                k = 1
                while k * f_norm < 0.5:
                    x += (4.0 / np.pi) * np.sin(2.0 * np.pi * k * f_norm * n + k * phi) / k
                    k += 2
                x *= a1
            else:
                x = a1 * signal.square(2.0 * np.pi * f_norm * n + phi)
        elif st == 'sawtooth':
            if bandlimit and f_norm > 0:
                x = np.zeros(int(n_samples), dtype=float)
                k = 1
                while k * f_norm < 0.5:
                    x += ((-1) ** (k + 1)) * (2.0 / np.pi) * np.sin(2.0 * np.pi * k * f_norm * n + k * phi) / k
                    k += 1
                x *= a1
            else:
                x = a1 * signal.sawtooth(2.0 * np.pi * f_norm * n + phi)
        elif st == 'chirp':
            f0 = max(1e-6, f_norm)
            f1 = 0.45
            x = a1 * signal.chirp(n, f0=f0, t1=max(1, len(n) - 1), f1=f1, phi=float(phi1_deg))
        else:
            x = np.zeros(int(n_samples), dtype=float)

        x = x + float(dc)

    # Optional additive noise
    nt = str(noise_type or 'none').lower()
    ns = float(noise_std or 0.0)
    if ns > 0 and nt != 'none':
        rng = np.random.default_rng(42)
        if nt == 'gauss':
            x = x + rng.normal(0.0, ns, size=len(n))
        elif nt == 'uniform':
            x = x + rng.uniform(-np.sqrt(3.0) * ns, np.sqrt(3.0) * ns, size=len(n))
        elif nt == 'prbs':
            x = x + rng.choice([-ns, ns], size=len(n))

    return n, x


def _get_fft_window(win_name, n_data):
    """Return FFT window array, NENBW, and CGAIN matching chipmuenk/pyfda."""
    w_name = str(win_name or 'rectangular').lower()
    if w_name in ('rectangular', 'boxcar', 'rect'):
        w = np.ones(n_data)
    elif w_name == 'kaiser':
        w = signal.windows.kaiser(n_data, beta=10.0, sym=False)
    elif w_name == 'chebwin':
        w = signal.windows.chebwin(n_data, at=80.0, sym=False)
    elif w_name == 'gaussian':
        w = signal.windows.gaussian(n_data, std=max(1.0, n_data / 6.0), sym=False)
    else:
        try:
            w = signal.get_window(w_name, n_data, fftbins=True)
        except Exception:
            w = np.ones(n_data)

    sum_w = float(np.sum(w))
    cgain = sum_w / n_data if n_data > 0 else 1.0
    nenbw = n_data * float(np.sum(np.square(w))) / (sum_w ** 2) if sum_w > 0 else 1.0
    return w, nenbw, cgain


def stimulus_response(b, a, stim_expr='sin(2*pi*n*1000/fs)', fs=48000, n_samples=256,
                      n_start=0, stim_type='custom', amp=1.0, freq1=1000.0,
                      phi1_deg=0.0, dc=0.0, noise_type='none', noise_std=0.0,
                      bandlimit=False, fft_win='rectangular', **kwargs):
    """Compute time response and single-sided FFT spectrum (matching pyfda plot_tran.py)."""
    b = np.array(b, dtype=float)
    a = np.array(a, dtype=float)
    fs = float(fs) if fs else 48000.0
    n_samples = max(16, int(n_samples))
    n_start = max(0, min(int(n_start or 0), n_samples - 16))

    try:
        n, x = _build_preset_stimulus(
            stim_type=stim_type, stim_expr=stim_expr, fs=fs, n_samples=n_samples,
            amp=amp, freq1=freq1, phi1_deg=phi1_deg, dc=dc,
            noise_type=noise_type, noise_std=noise_std, bandlimit=bandlimit
        )
    except Exception as e:
        raise ValueError(f"Invalid stimulus expression: {str(e)}")

    y = signal.lfilter(b, a, x)

    # Compute FFT on [n_start : n_samples]
    x_seg = x[n_start:]
    y_seg = y[n_start:]
    n_data = len(x_seg)
    win, nenbw, cgain = _get_fft_window(fft_win, n_data)
    win_norm = win / max(cgain, 1e-12)

    x_fft = np.fft.fft(x_seg * win_norm) / n_data
    y_fft = np.fft.fft(y_seg * win_norm) / n_data

    # Power calculations from full FFT corrected by NENBW (pyfda plot_tran.py L1647-1662)
    p_x = float(np.sum(np.square(np.abs(x_fft))) / nenbw)
    p_y = float(np.sum(np.square(np.abs(y_fft))) / nenbw)

    # Single-sided spectrum (0 ... f_S/2)
    half = n_data // 2
    f_fft = (np.fft.fftfreq(n_data, d=1.0 / fs)[:half]).tolist()
    x_ssb = np.insert(np.abs(x_fft[1:half]) * 2.0, 0, np.abs(x_fft[0]))
    y_ssb = np.insert(np.abs(y_fft[1:half]) * 2.0, 0, np.abs(y_fft[0]))

    x_fft_db = (20.0 * np.log10(np.maximum(x_ssb, 1e-12))).tolist()
    y_fft_db = (20.0 * np.log10(np.maximum(y_ssb, 1e-12))).tolist()

    return {
        'n': n.tolist(),
        'x': x.tolist(),
        'y': y.tolist(),
        'n_start': n_start,
        'fft_freq': f_fft,
        'x_fft_db': x_fft_db,
        'y_fft_db': y_fft_db,
        'x_fft_lin': x_ssb.tolist(),
        'y_fft_lin': y_ssb.tolist(),
        'p_x_dbw': float(10.0 * np.log10(max(p_x, 1e-24))),
        'p_y_dbw': float(10.0 * np.log10(max(p_y, 1e-24))),
        'nenbw': float(nenbw),
        'nenbw_db': float(10.0 * np.log10(max(nenbw, 1e-12))),
        'cgain': float(cgain),
        'cgain_db': float(20.0 * np.log10(max(cgain, 1e-12))),
    }


def pz_data(b, a, **kwargs):
    """Extract poles, zeros, and gain."""
    b = np.array(b, dtype=float)
    a = np.array(a, dtype=float)
    z, p, k = signal.tf2zpk(b, a)
    return {
        'zeros_real': np.real(z).tolist(),
        'zeros_imag': np.imag(z).tolist(),
        'poles_real': np.real(p).tolist(),
        'poles_imag': np.imag(p).tolist(),
        'gain': float(np.real(k)),
    }


def coeffs_to_zpk_sos(b, a, **kwargs):
    """Recompute zeros, poles, gain, and SOS from edited b,a coefficients."""
    b = np.array(b, dtype=float)
    a = np.array(a, dtype=float)
    z, p, k = signal.tf2zpk(b, a)
    is_iir = len(a) > 1 and not np.allclose(a[1:], 0)
    sos = signal.zpk2sos(z, p, k).tolist() if is_iir else None
    return {
        'b': b.tolist(),
        'a': a.tolist(),
        'zeros': [[float(zi.real), float(zi.imag)] for zi in z],
        'poles': [[float(pi.real), float(pi.imag)] for pi in p],
        'gain': float(np.real(k)),
        'sos': sos,
        'order': int(max(len(b), len(a)) - 1),
    }


def zpk_to_ba_sos(zeros, poles, gain=1.0, **kwargs):
    """Recompute b, a, and SOS from edited zeros, poles, gain."""
    z = np.array([complex(zi[0], zi[1]) for zi in (zeros or [])], dtype=complex)
    p = np.array([complex(pi[0], pi[1]) for pi in (poles or [])], dtype=complex)
    k = float(gain if gain is not None else 1.0)
    b, a = signal.zpk2tf(z, p, k)
    b = np.real_if_close(b, tol=1e4).astype(float)
    a = np.real_if_close(a, tol=1e4).astype(float)
    is_iir = len(a) > 1 and not np.allclose(a[1:], 0)
    sos = signal.zpk2sos(z, p, k).tolist() if is_iir else None
    return {
        'b': b.tolist(),
        'a': a.tolist(),
        'zeros': [[float(zi.real), float(zi.imag)] for zi in z],
        'poles': [[float(pi.real), float(pi.imag)] for pi in p],
        'gain': k,
        'sos': sos,
        'order': int(max(len(b), len(a)) - 1),
    }


def surface_3d(b, a, n_points=80, **kwargs):
    """Compute |H(z)| over the z-plane with equalized polynomial lengths for FIR/IIR."""
    b = np.array(b, dtype=float)
    a = np.array(a, dtype=float)

    # Pad shorter polynomial with trailing zeros so z^M factors cancel identically
    max_len = max(len(b), len(a))
    if len(b) < max_len:
        b = np.pad(b, (0, max_len - len(b)), mode='constant')
    if len(a) < max_len:
        a = np.pad(a, (0, max_len - len(a)), mode='constant')

    r = np.linspace(0.01, 1.5, int(n_points))
    theta = np.linspace(0, 2 * np.pi, int(n_points))
    R, Theta = np.meshgrid(r, theta)
    Z = R * np.exp(1j * Theta)

    num = np.polyval(b, Z)
    den = np.polyval(a, Z)

    with np.errstate(divide='ignore', invalid='ignore'):
        H = np.abs(num / np.where(np.abs(den) > 1e-15, den, 1e-15))
    H = np.nan_to_num(H, nan=50.0, posinf=50.0, neginf=0.0)
    H = np.clip(H, 0.0, 50.0)

    X = R * np.cos(Theta)
    Y = R * np.sin(Theta)

    return {
        'x': X.tolist(),
        'y': Y.tolist(),
        'z': H.tolist(),
    }


def filter_performance(b, a, specs=None, **kwargs):
    """Evaluate achieved |H(f)| at corner specs and overall Min/Max (from input_info.py)."""
    b = np.array(b, dtype=float)
    a = np.array(a, dtype=float)
    specs = specs or {}

    rt = specs.get('responseType', 'lowpass')
    ft = 'fir' if specs.get('filterFamily') == 'fir' else 'iir'
    fs = float(specs.get('fs', 48000.0) or 48000.0)
    freq_unit = specs.get('freqUnit', 'hz')
    amp_unit = specs.get('ampUnit', 'db')

    _unit2lin = globals().get('unit2lin')
    _lin2db = globals().get('lin2db')
    if _unit2lin is None or _lin2db is None:
        from filter_design import unit2lin as _unit2lin, lin2db as _lin2db

    def _to_fs_norm(val):
        v = float(val or 0.0)
        if freq_unit == 'normalized':
            return v
        if freq_unit == 'f_ny':
            return v / 2.0
        return v / fs

    apb_db = _lin2db(_unit2lin(specs.get('apb', 1.0), ft, 'a_pb', amp_unit), ft, 'a_pb')
    asb_db = _lin2db(_unit2lin(specs.get('asb', 60.0), ft, 'a_sb', amp_unit), ft, 'a_sb')

    rows = []
    pairs = []
    if rt == 'lowpass':
        pairs = [('F_PB', specs.get('fpb'), 'pb', -apb_db), ('F_SB', specs.get('fsb'), 'sb', -asb_db)]
    elif rt == 'highpass':
        pairs = [('F_SB', specs.get('fsb'), 'sb', -asb_db), ('F_PB', specs.get('fpb'), 'pb', -apb_db)]
    elif rt == 'bandpass':
        pairs = [
            ('F_SB', specs.get('fsb'), 'sb', -asb_db),
            ('F_PB', specs.get('fpb'), 'pb', -apb_db),
            ('F_PB2', specs.get('fpb2'), 'pb', -apb_db),
            ('F_SB2', specs.get('fsb2'), 'sb', -asb_db),
        ]
    elif rt == 'bandstop':
        pairs = [
            ('F_PB', specs.get('fpb'), 'pb', -apb_db),
            ('F_SB', specs.get('fsb'), 'sb', -asb_db),
            ('F_SB2', specs.get('fsb2'), 'sb', -asb_db),
            ('F_PB2', specs.get('fpb2'), 'pb', -apb_db),
        ]

    eps = 1e-3
    for label, f_disp, kind, target_db in pairs:
        f_norm = max(0.0, min(0.5, _to_fs_norm(f_disp)))
        _, h = signal.freqz(b, a, worN=[2.0 * np.pi * f_norm])
        mag = float(np.abs(h[0]))
        mag_db = float(20.0 * np.log10(max(mag, 1e-15)))
        if kind == 'pb':
            passed = (mag_db >= target_db - eps)
        else:
            passed = (mag_db <= target_db + eps)
        rows.append({
            'label': label,
            'freq': float(f_disp or 0.0),
            'spec_db': float(target_db),
            'actual_db': mag_db,
            'actual_lin': mag,
            'passed': bool(passed),
        })

    # Min / Max across 0..0.5
    w_all, h_all = signal.freqz(b, a, worN=2048)
    mag_all = np.abs(h_all)
    idx_min = int(np.argmin(mag_all))
    idx_max = int(np.argmax(mag_all))
    f_scale = 1.0 if freq_unit == 'normalized' else (2.0 if freq_unit == 'f_ny' else fs)

    rows.append({
        'label': 'Min.',
        'freq': float((w_all[idx_min] / (2.0 * np.pi)) * f_scale),
        'spec_db': None,
        'actual_db': float(20.0 * np.log10(max(mag_all[idx_min], 1e-15))),
        'actual_lin': float(mag_all[idx_min]),
        'passed': True,
    })
    rows.append({
        'label': 'Max.',
        'freq': float((w_all[idx_max] / (2.0 * np.pi)) * f_scale),
        'spec_db': None,
        'actual_db': float(20.0 * np.log10(max(mag_all[idx_max], 1e-15))),
        'actual_lin': float(mag_all[idx_max]),
        'passed': True,
    })

    return {'rows': rows, 'all_passed': all(r['passed'] for r in rows)}
