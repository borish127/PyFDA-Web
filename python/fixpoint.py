"""
PyFDA Web — Fixpoint Simulation
Quantization, overflow handling, and fixpoint filter comparison
"""
import numpy as np
from scipy import signal


def quantize_value(value, qi, qf, overflow='saturate', quant_mode='round'):
    """
    Quantize a floating-point value to fixed-point representation.

    Args:
        value: float or array
        qi: number of integer bits (excluding sign bit)
        qf: number of fractional bits
        overflow: 'saturate' or 'wrap'
        quant_mode: 'round', 'truncate', 'floor', 'ceil'
    """
    value = np.asarray(value, dtype=float)
    total_bits = 1 + qi + qf  # sign + integer + fractional
    scale = 2.0 ** qf

    # Quantize
    scaled = value * scale

    if quant_mode == 'round':
        scaled = np.round(scaled)
    elif quant_mode == 'truncate':
        scaled = np.fix(scaled)  # truncate toward zero
    elif quant_mode == 'floor':
        scaled = np.floor(scaled)
    elif quant_mode == 'ceil':
        scaled = np.ceil(scaled)

    # Integer range
    max_val = (2 ** (total_bits - 1)) - 1
    min_val = -(2 ** (total_bits - 1))

    # Overflow handling
    if overflow == 'saturate':
        scaled = np.clip(scaled, min_val, max_val)
    elif overflow == 'wrap':
        range_size = 2 ** total_bits
        scaled = ((scaled + max_val + 1) % range_size) + min_val

    # Convert back to float
    result = scaled / scale
    return result


def fixpoint_filter(b, a, x=None, coeff_qi=1, coeff_qf=15,
                    signal_qi=1, signal_qf=15,
                    overflow='saturate', quant_mode='round',
                    n_samples=256, **kwargs):
    """
    Simulate a fixpoint filter implementation and compare with floating-point.

    Returns both floating-point and fixpoint responses for overlay comparison.
    """
    b = np.array(b, dtype=float)
    a = np.array(a, dtype=float)

    # Generate test stimulus if not provided
    if x is None:
        # Impulse
        x = np.zeros(n_samples)
        x[0] = 1.0

    x = np.array(x, dtype=float)

    # Floating-point reference
    y_float = signal.lfilter(b, a, x)

    # Quantize coefficients
    b_q = quantize_value(b, coeff_qi, coeff_qf, overflow, quant_mode)
    a_q = quantize_value(a, coeff_qi, coeff_qf, overflow, quant_mode)

    # Ensure a_q[0] is not zero
    if abs(a_q[0]) < 1e-15:
        a_q[0] = 1.0

    # Quantize input signal
    x_q = quantize_value(x, signal_qi, signal_qf, overflow, quant_mode)

    # Direct-form I fixpoint filtering with intermediate quantization
    nb = len(b_q)
    na = len(a_q)
    n = len(x_q)
    y_fix = np.zeros(n)

    for i in range(n):
        # FIR part (numerator)
        acc = 0.0
        for j in range(nb):
            if i - j >= 0:
                acc += b_q[j] * x_q[i - j]

        # IIR part (denominator, skip a[0])
        for j in range(1, na):
            if i - j >= 0:
                acc -= a_q[j] * y_fix[i - j]

        acc = acc / a_q[0]

        # Quantize output
        y_fix[i] = quantize_value(acc, signal_qi, signal_qf, overflow, quant_mode)

    # Compute frequency responses for comparison
    w, h_float = signal.freqz(b, a, worN=1024)
    _, h_fix = signal.freqz(b_q, a_q, worN=1024)

    freq_norm = w / np.pi

    error = y_float - y_fix
    snr = 10 * np.log10(np.sum(y_float**2) / max(np.sum(error**2), 1e-30))

    return {
        'n': list(range(n)),
        'y_float': y_float.tolist(),
        'y_fix': y_fix.tolist(),
        'error': error.tolist(),
        'snr_db': float(snr),
        'b_quantized': b_q.tolist(),
        'a_quantized': a_q.tolist(),
        'freq_norm': freq_norm.tolist(),
        'mag_float_db': (20 * np.log10(np.maximum(np.abs(h_float), 1e-15))).tolist(),
        'mag_fix_db': (20 * np.log10(np.maximum(np.abs(h_fix), 1e-15))).tolist(),
        'total_bits': 1 + coeff_qi + coeff_qf,
    }
