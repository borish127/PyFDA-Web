"""
PyFDA Web — Fixpoint Simulation
Full port of pyfda's Fixed class and FIR/IIR Direct-Form filter architectures.

Provides:
  - Fixed:            Quantizer class with overflow tracking
  - FIR_DF_pyfixp:    FIR Direct-Form filter using per-stage Fixed quantizers
  - IIR_DF1_pyfixp:   IIR Direct-Form I filter using per-stage Fixed quantizers
  - fixpoint_filter:  Top-level bridge callable from JS via PyodideBridge
"""
import numpy as np
from scipy import signal

# =============================================================================
#  Fixed — Binary fixpoint quantizer
# =============================================================================
class Fixed:
    """
    Binary quantizer for signed fixed-point numbers in WI.WF format.
    Total word length is W = 1 + WI + WF (1 sign bit + WI integer bits + WF fractional bits).
    """
    def __init__(self, q_dict: dict):
        self.q_dict = q_dict.copy()
        self.WI = int(self.q_dict.get('WI', 0))
        self.WF = int(abs(self.q_dict.get('WF', 15)))
        self.quant = self.q_dict.get('quant', 'floor')
        self.ovfl = self.q_dict.get('ovfl', 'wrap')
        self.N_over = 0
        self._calc_params()

    def _calc_params(self):
        self.LSB = 2.0 ** (-self.WF)
        self.MSB = 2.0 ** (self.WI - 1) if self.WI > 0 else 0.5
        self.MIN = -2.0 * self.MSB
        self.MAX = 2.0 * self.MSB - self.LSB

    def resetN(self):
        self.N_over = 0
        self.q_dict['N_over'] = 0

    def fixp(self, y) -> np.ndarray:
        """
        Return a quantized copy of y (scalar or array-like).
        The processing chain is:
          1. Scale to integer grid (multiply by 2**WF)
          2. Quantize (floor / round / fix / ceil / rint)
          3. Detect and handle overflow (wrap / sat)
          4. Scale back to fractional format (divide by 2**WF)
        """
        y = np.asarray(y, dtype=np.float64)
        scalar = (y.ndim == 0)
        y = np.atleast_1d(y)

        # Scale to integer grid
        yq = y * (2.0 ** self.WF)

        # Quantize
        if self.quant == 'floor':
            yq = np.floor(yq)
        elif self.quant == 'round':
            yq = np.round(yq)
        elif self.quant == 'fix':
            yq = np.fix(yq)
        elif self.quant == 'ceil':
            yq = np.ceil(yq)
        elif self.quant == 'rint':
            yq = np.rint(yq)
        elif self.quant == 'none':
            pass
        else:
            raise ValueError(f"Unknown quantization mode '{self.quant}'")

        # Overflow / Saturation limits in integer domain
        MSB_i = 1 << (self.WI + self.WF - 1)  # 2 ** (W - 2) in integer domain
        MAX_i = 2 * MSB_i - 1                 # 2 ** (W - 1) - 1
        MIN_i = -2 * MSB_i                    # -2 ** (W - 1)

        if self.ovfl != 'none':
            over_pos = yq > MAX_i
            over_neg = yq < MIN_i

            n_over = int(np.sum(over_pos) + np.sum(over_neg))
            self.N_over += n_over
            self.q_dict['N_over'] = self.N_over

            if self.ovfl == 'sat':
                yq = np.clip(yq, MIN_i, MAX_i)
            elif self.ovfl == 'wrap':
                yq = np.where(
                    over_pos | over_neg,
                    yq - 4.0 * MSB_i * np.fix((np.sign(yq) * 2 * MSB_i + yq) / (4 * MSB_i)),
                    yq
                )
            else:
                raise ValueError(f"Unknown overflow mode '{self.ovfl}'")

        # Scale back to fractional
        yq = yq / (2.0 ** self.WF)

        if scalar:
            return float(yq[0])
        return yq

    def requant(self, y, Q_src):
        """Align format and requantize."""
        return self.fixp(y)


# =============================================================================
#  FIR_DF_pyfixp — FIR Direct-Form filter with correct tap multiplication
# =============================================================================
class FIR_DF_pyfixp:
    """
    FIR Direct-Form I filter with quantized multiply-accumulate (MAC).
    """
    def __init__(self, b, QCB, QI, QACC, QO):
        self.Q_b = Fixed(QCB)
        self.Q_i = Fixed(QI)
        self.Q_mul = Fixed(QACC.copy())
        self.Q_acc = Fixed(QACC)
        self.Q_o = Fixed(QO)

        self.b_q = self.Q_b.fixp(b)
        self.L = len(self.b_q)
        self.reset()

    def reset(self):
        self.zi = np.zeros(self.L - 1) if self.L > 1 else np.array([])
        self.Q_b.resetN()
        self.Q_i.resetN()
        self.Q_mul.resetN()
        self.Q_acc.resetN()
        self.Q_o.resetN()

    def fxfilter(self, x: np.ndarray) -> np.ndarray:
        x = np.asarray(x, dtype=np.float64)
        x_q = self.Q_i.fixp(x)
        N = len(x_q)
        y_q = np.zeros(N)

        # Prepend register state
        data = np.concatenate((self.zi, x_q))

        for k in range(N):
            # Slice window and flip it (mathematically correct convolution ordering)
            window = data[k : k + self.L][::-1]
            products = window * self.b_q

            # Quantize partial products
            products_q = self.Q_mul.fixp(products)

            # Accumulate and quantize
            acc = self.Q_acc.fixp(np.sum(products_q))
            y_q[k] = acc

        # Store last L-1 inputs as register state
        if self.L > 1:
            self.zi = data[-(self.L - 1):]

        # Output quantization
        y_out = self.Q_o.fixp(y_q)
        return y_out


# =============================================================================
#  IIR_DF1_pyfixp — IIR Direct-Form I filter with correct tap multiplication
# =============================================================================
class IIR_DF1_pyfixp:
    """
    IIR Direct-Form I filter with quantized multiply-accumulate (MAC).
    """
    def __init__(self, b, a, QCB, QCA, QI, QACC, QO):
        self.Q_b = Fixed(QCB)
        self.Q_a = Fixed(QCA)
        self.Q_i = Fixed(QI)
        self.Q_mul_b = Fixed(QACC.copy())
        self.Q_mul_a = Fixed(QACC.copy())
        self.Q_acc = Fixed(QACC)
        self.Q_o = Fixed(QO)

        # Quantize coefficients. a[0] is assumed to be normalized to 1.0 and is not quantized.
        self.b_q = self.Q_b.fixp(b)
        self.a_q = np.concatenate(([1.0], self.Q_a.fixp(a[1:]))) if len(a) > 1 else np.array([1.0])

        self.L = max(len(self.b_q), len(self.a_q))

        # Pad zero coefficients so arrays match length L
        if len(self.b_q) < self.L:
            self.b_q = np.concatenate((self.b_q, np.zeros(self.L - len(self.b_q))))
        if len(self.a_q) < self.L:
            self.a_q = np.concatenate((self.a_q, np.zeros(self.L - len(self.a_q))))

        self.reset()

    def reset(self):
        self.zi_b = np.zeros(self.L - 1) if self.L > 1 else np.array([])
        self.zi_a = np.zeros(self.L - 1) if self.L > 1 else np.array([])
        self.Q_b.resetN()
        self.Q_a.resetN()
        self.Q_i.resetN()
        self.Q_mul_b.resetN()
        self.Q_mul_a.resetN()
        self.Q_acc.resetN()
        self.Q_o.resetN()

    def fxfilter(self, x: np.ndarray) -> np.ndarray:
        x = np.asarray(x, dtype=np.float64)
        x_q = self.Q_i.fixp(x)
        N = len(x_q)
        y_q = np.zeros(N)

        self.zi_b = np.concatenate((self.zi_b, x_q))

        for k in range(N):
            # Transversal part (FIR, numerator): reverse window slice
            window_b = self.zi_b[k : k + len(self.b_q)][::-1]
            xb_prod = window_b * self.b_q
            xb_q = self.Q_mul_b.fixp(xb_prod)
            sum_b = self.Q_acc.fixp(np.sum(xb_q))

            # Recursive part (IIR, denominator): zi_a is already newest-to-oldest
            window_a = self.zi_a
            ya_prod = window_a * self.a_q[1:]
            ya_q = self.Q_mul_a.fixp(ya_prod)
            sum_a = self.Q_acc.fixp(np.sum(ya_q))

            # Accumulator and output quantization
            acc = self.Q_acc.fixp(sum_b - sum_a)
            out = self.Q_o.fixp(acc)
            y_q[k] = out

            # Shift output into recursive state register
            if self.L > 1:
                self.zi_a[1:] = self.zi_a[:-1]
                self.zi_a[0] = out

        # Store last L-1 inputs
        if self.L > 1:
            self.zi_b = self.zi_b[-(self.L - 1):]

        return y_q


# =============================================================================
#  IIR_SOS_pyfixp — IIR Cascade of Second-Order Sections (SOS) filter
# =============================================================================
class IIR_SOS_pyfixp:
    """
    IIR Cascade of Second-Order Sections (SOS) filter using per-stage Fixed quantizers.
    """
    def __init__(self, sos, QCB, QCA, QI, QACC, QO):
        self.sections = []
        # Distribute gain K across all sections to avoid underflow/overflow
        Ns = len(sos)
        g = [np.max(np.abs(sos[i, 0:3])) for i in range(Ns)]
        K = np.prod(g)
        K_dist = K ** (1.0 / Ns) if K > 1e-30 else 0.0

        for i in range(Ns):
            # Normalize numerator and apply distributed gain
            b_sec = (sos[i, 0:3] / g[i]) * K_dist if g[i] > 1e-30 else np.zeros(3)
            a_sec = sos[i, 3:6]
            self.sections.append(IIR_DF1_pyfixp(b_sec, a_sec, QCB, QCA, QI, QACC, QO))

        # Compute overall equivalent quantized b_q and a_q by convolving section coefficients
        b_q = np.array([1.0])
        a_q = np.array([1.0])
        for sec in self.sections:
            b_q = np.convolve(b_q, sec.b_q)
            a_q = np.convolve(a_q, sec.a_q)
        self.b_q = b_q
        self.a_q = a_q

    def reset(self):
        for sec in self.sections:
            sec.reset()

    def fxfilter(self, x: np.ndarray) -> np.ndarray:
        out = x
        for sec in self.sections:
            out = sec.fxfilter(out)
        return out


# =============================================================================
#  fixpoint_filter — Top-level bridge function (called from JS)
# =============================================================================
def fixpoint_filter(b, a, x=None, sos=None,
                    coeff_qi=4, coeff_qf=15,
                    signal_qi=4, signal_qf=12,
                    overflow='saturate', quant_mode='round',
                    n_samples=256,
                    # Advanced: full q_dict overrides (optional)
                    q_coeff=None, q_input=None, q_acc=None, q_output=None,
                    **kwargs):
    """
    Simulate fixpoint filter responses and compare with floating-point references.
    Calculates impulse, step, and custom stimulus responses, alongside frequency
    and pole-zero data of the quantized filter.
    """
    b = np.array(b, dtype=np.float64)
    a = np.array(a, dtype=np.float64)

    # Normalize overflow/quantization naming
    ovfl_map = {'saturate': 'sat', 'wrap': 'wrap', 'sat': 'sat'}
    ovfl = ovfl_map.get(overflow, 'sat')

    quant_map = {
        'round': 'round', 'truncate': 'fix', 'fix': 'fix',
        'floor': 'floor', 'ceil': 'ceil', 'rint': 'rint',
    }
    quant = quant_map.get(quant_mode, 'round')

    def _qd(wi, wf, q=quant, o=ovfl):
        return {'WI': int(wi), 'WF': int(wf), 'quant': q, 'ovfl': o, 'N_over': 0}

    # QI/QACC/QO are configured from signal bit widths; QCB/QCA from coefficient widths
    QCB  = q_coeff  or _qd(coeff_qi, coeff_qf)
    QCA  = q_coeff  or _qd(coeff_qi, coeff_qf)
    QI   = q_input  or _qd(signal_qi, signal_qf)
    QACC = q_acc    or _qd(signal_qi, signal_qf)
    QO   = q_output or _qd(signal_qi, signal_qf)

    # Normalize coefficients by a[0]
    a0 = a[0] if abs(a[0]) > 1e-15 else 1.0
    b_norm = b / a0
    a_norm = a / a0

    is_fir = (len(a_norm) == 1) or np.allclose(a_norm[1:], 0)

    # 1. Instantiate the filter
    if is_fir:
        filt = FIR_DF_pyfixp(b_norm, QCB, QI, QACC, QO)
        b_q = filt.b_q
        a_q = np.array([1.0])
    elif sos is not None and len(sos) > 0:
        sos = np.asarray(sos, dtype=np.float64)
        filt = IIR_SOS_pyfixp(sos, QCB, QCA, QI, QACC, QO)
        b_q = filt.b_q
        a_q = filt.a_q
    else:
        filt = IIR_DF1_pyfixp(b_norm, a_norm, QCB, QCA, QI, QACC, QO)
        b_q = filt.b_q
        a_q = filt.a_q

    # 2. Simulate impulse response
    x_imp = np.zeros(n_samples)
    x_imp[0] = 1.0
    filt.reset()
    y_fix_imp = filt.fxfilter(x_imp)

    # 3. Simulate step response
    x_step = np.ones(n_samples)
    filt.reset()
    y_fix_step = filt.fxfilter(x_step)

    # 4. Simulate custom stimulus (if provided)
    y_fix_stim = None
    if x is not None:
        x_stim = np.array(x, dtype=np.float64)
        filt.reset()
        y_fix_stim = filt.fxfilter(x_stim).tolist()

    # 5. Extract overflow counts from the final run
    if is_fir:
        overflow_counts = {
            'coeff':  filt.Q_b.N_over,
            'input':  filt.Q_i.N_over,
            'acc':    filt.Q_acc.N_over + filt.Q_mul.N_over,
            'output': filt.Q_o.N_over,
        }
    elif isinstance(filt, IIR_SOS_pyfixp):
        overflow_counts = {
            'coeff':  sum(sec.Q_b.N_over + sec.Q_a.N_over for sec in filt.sections),
            'input':  sum(sec.Q_i.N_over for sec in filt.sections),
            'acc':    sum(sec.Q_acc.N_over + sec.Q_mul_b.N_over + sec.Q_mul_a.N_over for sec in filt.sections),
            'output': sum(sec.Q_o.N_over for sec in filt.sections),
        }
    else:
        overflow_counts = {
            'coeff':  filt.Q_b.N_over + filt.Q_a.N_over,
            'input':  filt.Q_i.N_over,
            'acc':    filt.Q_acc.N_over + filt.Q_mul_b.N_over + filt.Q_mul_a.N_over,
            'output': filt.Q_o.N_over,
        }

    # 6. Frequency response
    w, h_float = signal.freqz(b_norm, a_norm, worN=1024)
    _, h_fix   = signal.freqz(b_q, a_q, worN=1024)
    freq_norm  = w / np.pi

    mag_float_db = (20 * np.log10(np.maximum(np.abs(h_float), 1e-15))).tolist()
    mag_fix_db   = (20 * np.log10(np.maximum(np.abs(h_fix), 1e-15))).tolist()

    phase_float_rad = np.unwrap(np.angle(h_float))
    phase_fix_rad   = np.unwrap(np.angle(h_fix))
    phase_float_deg = np.degrees(phase_float_rad).tolist()
    phase_fix_deg   = np.degrees(phase_fix_rad).tolist()

    # 7. Group delay (in samples)
    _, gd_float = signal.group_delay((b_norm, a_norm), w=1024)
    _, gd_fix   = signal.group_delay((b_q, a_q), w=1024)

    # 8. Phase delay (in samples)
    pd_float = np.zeros_like(phase_float_rad)
    pd_fix = np.zeros_like(phase_fix_rad)
    mask = w > 1e-10
    pd_float[mask] = -phase_float_rad[mask] / w[mask]
    pd_fix[mask] = -phase_fix_rad[mask] / w[mask]

    # 9. Poles and zeros
    z_float, p_float, k_float = signal.tf2zpk(b_norm, a_norm)
    z_fix, p_fix, k_fix = signal.tf2zpk(b_q, a_q)

    # 10. Compute error metrics for impulse response
    y_float_imp = signal.lfilter(b_norm, a_norm, x_imp)
    error = y_float_imp - y_fix_imp
    sig_power = np.sum(y_float_imp ** 2)
    err_power = np.sum(error ** 2)
    snr = 10 * np.log10(sig_power / max(err_power, 1e-30))

    total_bits = 1 + int(QCB.get('WI', coeff_qi)) + int(QCB.get('WF', coeff_qf))

    return {
        'n':              list(range(n_samples)),
        'y_float_imp':    y_float_imp.tolist(),
        'y_fix_imp':      y_fix_imp.tolist(),
        'y_fix_step':     y_fix_step.tolist(),
        'y_fix_stim':     y_fix_stim,
        'error_imp':      error.tolist(),
        'snr_db':         float(snr),
        'b_quantized':    b_q.tolist(),
        'a_quantized':    a_q.tolist(),
        'freq_norm':      freq_norm.tolist(),
        'mag_float_db':   mag_float_db,
        'mag_fix_db':     mag_fix_db,
        'phase_float_deg': phase_float_deg,
        'phase_fix_deg':   phase_fix_deg,
        'gd_float':       gd_float.tolist(),
        'gd_fix':         gd_fix.tolist(),
        'pd_float':       pd_float.tolist(),
        'pd_fix':         pd_fix.tolist(),
        'zeros_float_real': np.real(z_float).tolist(),
        'zeros_float_imag': np.imag(z_float).tolist(),
        'poles_float_real': np.real(p_float).tolist(),
        'poles_float_imag': np.imag(p_float).tolist(),
        'zeros_fix_real':  np.real(z_fix).tolist(),
        'zeros_fix_imag':  np.imag(z_fix).tolist(),
        'poles_fix_real':  np.real(p_fix).tolist(),
        'poles_fix_imag':  np.imag(p_fix).tolist(),
        'total_bits':     total_bits,
        'overflow_counts': overflow_counts,
    }
