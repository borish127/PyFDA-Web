"""
PyFDA Web — Filter Analysis Functions
Frequency response, group delay, phase delay, impulse/step response, P/Z, 3D surface
"""
import numpy as np
from scipy import signal


def freq_response(b, a, fs=48000, n_points=2048, **kwargs):
    """Compute magnitude and phase frequency response."""
    b = np.array(b, dtype=float)
    a = np.array(a, dtype=float)
    w, h = signal.freqz(b, a, worN=n_points, fs=fs)

    mag = np.abs(h)
    mag_db = 20 * np.log10(np.maximum(mag, 1e-15))
    phase_rad = np.unwrap(np.angle(h))
    phase_deg = np.degrees(phase_rad)

    return {
        'freq': w.tolist(),
        'mag': mag.tolist(),
        'mag_db': mag_db.tolist(),
        'phase_rad': phase_rad.tolist(),
        'phase_deg': phase_deg.tolist(),
    }


def group_delay_analysis(b, a, fs=48000, n_points=2048, **kwargs):
    """Compute group delay."""
    b = np.array(b, dtype=float)
    a = np.array(a, dtype=float)

    # Use scipy.signal.group_delay
    w, gd = signal.group_delay((b, a), w=n_points, fs=fs)

    return {
        'freq': w.tolist(),
        'group_delay': gd.tolist(),
    }


def phase_delay(b, a, fs=48000, n_points=2048, **kwargs):
    """Compute phase delay: -phase(w) / w."""
    b = np.array(b, dtype=float)
    a = np.array(a, dtype=float)
    w, h = signal.freqz(b, a, worN=n_points, fs=fs)

    phase = np.unwrap(np.angle(h))
    # Phase delay = -phase / (2*pi*freq/fs), avoid division by zero
    omega = 2 * np.pi * w / fs
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

    # Create impulse
    impulse = np.zeros(n_samples)
    impulse[0] = 1.0

    h = signal.lfilter(b, a, impulse)

    return {
        'n': list(range(n_samples)),
        'h': h.tolist(),
    }


def step_response(b, a, n_samples=256, **kwargs):
    """Compute step response."""
    b = np.array(b, dtype=float)
    a = np.array(a, dtype=float)

    step_input = np.ones(n_samples)
    s = signal.lfilter(b, a, step_input)

    return {
        'n': list(range(n_samples)),
        's': s.tolist(),
    }


def stimulus_response(b, a, stim_expr='sin(2*pi*n*1000/fs)', fs=48000, n_samples=256, **kwargs):
    """Compute response to an arbitrary stimulus expression."""
    b = np.array(b, dtype=float)
    a = np.array(a, dtype=float)

    n = np.arange(n_samples)
    pi = np.pi

    # Safe evaluation of the stimulus expression
    allowed_funcs = {
        'sin': np.sin, 'cos': np.cos, 'tan': np.tan,
        'abs': np.abs, 'sqrt': np.sqrt, 'exp': np.exp,
        'log': np.log, 'log10': np.log10,
        'pi': pi, 'n': n, 'fs': fs,
        'sign': np.sign, 'heaviside': np.heaviside,
        'sinc': np.sinc, 'floor': np.floor, 'ceil': np.ceil,
    }

    try:
        x = eval(stim_expr, {"__builtins__": {}}, allowed_funcs)
        if isinstance(x, (int, float)):
            x = np.full(n_samples, x)
        x = np.array(x, dtype=float)
    except Exception as e:
        raise ValueError(f"Invalid stimulus expression: {str(e)}")

    y = signal.lfilter(b, a, x)

    return {
        'n': n.tolist(),
        'x': x.tolist(),
        'y': y.tolist(),
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


def surface_3d(b, a, n_points=80, **kwargs):
    """Compute |H(z)| over the z-plane for 3D visualization."""
    b = np.array(b, dtype=float)
    a = np.array(a, dtype=float)

    # Create grid in the z-plane
    r = np.linspace(0.01, 1.5, n_points)
    theta = np.linspace(0, 2 * np.pi, n_points)
    R, Theta = np.meshgrid(r, theta)
    Z = R * np.exp(1j * Theta)

    # Evaluate H(z) = B(z) / A(z) using polynomial evaluation
    num = np.polyval(b, Z)
    den = np.polyval(a, Z)

    H = np.abs(num / (den + 1e-15))
    # Clip for visualization
    H = np.clip(H, 0, 50)

    # Convert to Cartesian for Plotly surface
    X = R * np.cos(Theta)
    Y = R * np.sin(Theta)

    return {
        'x': X.tolist(),
        'y': Y.tolist(),
        'z': H.tolist(),
    }
