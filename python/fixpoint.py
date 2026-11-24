"""
PyFDA Web — Fixpoint Simulation, Formatting & Verilog HDL Generation
Port of chipmuenk/pyfda Fixed class, FIR/IIR Direct-Form & SOS filter architectures,
binary/hex/CSD coefficient formatting, and Verilog HDL synthesis.
"""
import numpy as np
from scipy import signal


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
        self.W = 1 + self.WI + self.WF
        self.LSB = 2.0 ** (-self.WF)
        self.MSB = 2.0 ** (self.WI - 1) if self.WI > 0 else 0.5
        self.MIN = -(2.0 ** self.WI)
        self.MAX = (2.0 ** self.WI) - self.LSB

    def resetN(self):
        self.N_over = 0
        self.q_dict['N_over'] = 0

    def fixp(self, y) -> np.ndarray:
        y = np.asarray(y, dtype=np.float64)
        scalar = (y.ndim == 0)
        y = np.atleast_1d(y)

        yq = y * (2.0 ** self.WF)

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

        MSB_i = 2.0 ** (self.WI + self.WF - 1) if (self.WI + self.WF) >= 1 else 0.5
        MAX_i = 2.0 * MSB_i - 1.0
        MIN_i = -2.0 * MSB_i

        if self.ovfl != 'none':
            over_pos = yq > MAX_i
            over_neg = yq < MIN_i
            self.N_over += int(np.sum(over_pos) + np.sum(over_neg))
            self.q_dict['N_over'] = self.N_over

            if self.ovfl == 'sat':
                yq = np.clip(yq, MIN_i, MAX_i)
            elif self.ovfl == 'wrap':
                span = 4.0 * MSB_i
                yq = np.where(
                    over_pos | over_neg,
                    ((yq - MIN_i) % span) + MIN_i,
                    yq
                )
            else:
                raise ValueError(f"Unknown overflow mode '{self.ovfl}'")

        yq = yq / (2.0 ** self.WF)
        return float(yq[0]) if scalar else yq


def _bin2hex(bin_str: str, wi: int = 0) -> str:
    """Port of pyfda_fix_lib.bin2hex."""
    wmap = {
        '0000': '0', '0001': '1', '0010': '2', '0011': '3',
        '0100': '4', '0101': '5', '0110': '6', '0111': '7',
        '1000': '8', '1001': '9', '1010': 'A', '1011': 'B',
        '1100': 'C', '1101': 'D', '1110': 'E', '1111': 'F',
    }
    hex_str = ""
    if wi > 0:
        bin_i = bin_str[:wi + 1]
        while len(bin_i) % 4 != 0:
            bin_i = "0" + bin_i
        for i in range(0, len(bin_i), 4):
            hex_str += wmap[bin_i[i:i + 4]]
    else:
        hex_str = bin_str[0]

    wf = len(bin_str) - wi - 1
    if wf > 0:
        hex_str += '.'
        bin_f = bin_str[wi + 1:]
        while len(bin_f) % 4 != 0:
            bin_f += "0"
        for i in range(0, len(bin_f), 4):
            hex_str += wmap[bin_f[i:i + 4]]
    return hex_str or "0"


def _dec2csd(dec_val: float, wf: int = 0) -> str:
    """Port of pyfda_fix_lib.dec2csd (Canonical Signed Digit)."""
    if dec_val == 0:
        return '0'
    k = 0 if abs(dec_val) < 1.0 else int(np.ceil(np.log2(abs(dec_val) * 1.5)))
    csd_digits = []
    remainder = float(dec_val)
    prev_non_zero = False
    k -= 1
    while k >= -wf:
        limit = (2.0 ** (k + 1)) / 3.0
        if k == -1:
            if not csd_digits:
                if dec_val > limit:
                    remainder -= 1.0
                    csd_digits.append('+.')
                    prev_non_zero = True
                elif dec_val < -limit:
                    remainder += 1.0
                    csd_digits.append('-.')
                    prev_non_zero = True
                else:
                    csd_digits.append('0.')
            else:
                csd_digits.append('.')
        if prev_non_zero:
            csd_digits.append('0')
            prev_non_zero = False
        elif remainder > limit:
            csd_digits.append('+')
            remainder -= (2.0 ** k)
            prev_non_zero = True
        elif remainder < -limit:
            csd_digits.append('-')
            remainder += (2.0 ** k)
            prev_non_zero = True
        else:
            csd_digits.append('0')
            prev_non_zero = False
        k -= 1
    return "".join(csd_digits)


def _float_to_bin_str(val: float, wi: int, wf: int, ovfl='sat', quant='round') -> tuple[str, int]:
    """Quantize scalar val to WI.WF and return (two's-complement bitstring, overflow flag)."""
    q = Fixed({'WI': wi, 'WF': wf, 'ovfl': ovfl, 'quant': quant})
    vq = q.fixp(val)
    w = 1 + wi + wf
    int_val = int(round(vq * (2.0 ** wf)))
    if int_val < 0:
        int_val = (1 << w) + int_val
    int_val &= (1 << w) - 1
    bits = format(int_val, f'0{w}b')
    return bits, q.N_over


def format_coeffs(b, a, fmt='float', wi=0, wf=15, ovfl='sat', quant='round', digits=6, **kwargs):
    """Format b and a coefficients in float, dec, bin, hex, or csd (matching input_coeffs.py)."""
    b = [float(x) for x in (b or [])]
    a = [float(x) for x in (a or [])]
    fmt = str(fmt or 'float').lower()
    wi = max(0, int(wi))
    wf = max(0, int(wf))
    digits = max(2, min(16, int(digits or 6)))

    def _fmt_one(val):
        if fmt == 'float':
            if abs(val) < 1e-15:
                return '0'
            if abs(val) >= 1e4 or (abs(val) < 1e-4 and val != 0):
                return f"{val:.{max(2, digits - 2)}e}"
            return f"{val:.{digits}g}"
        q = Fixed({'WI': wi, 'WF': wf, 'ovfl': ovfl, 'quant': quant})
        vq = q.fixp(val)
        if fmt == 'dec':
            return str(int(round(vq * (2.0 ** wf))))
        if fmt == 'csd':
            return _dec2csd(vq, wf)
        bits, _ = _float_to_bin_str(val, wi, wf, ovfl, quant)
        if fmt == 'bin':
            return (bits[:wi + 1] + '.' + bits[wi + 1:]) if wf > 0 else bits
        if fmt == 'hex':
            return _bin2hex(bits, wi)
        return str(vq)

    q_meta = Fixed({'WI': wi, 'WF': wf, 'ovfl': ovfl, 'quant': quant})
    return {
        'b_str': [_fmt_one(v) for v in b],
        'a_str': [_fmt_one(v) for v in a],
        'w': q_meta.W,
        'lsb': q_meta.LSB,
        'msb': q_meta.MSB,
        'max': q_meta.MAX,
        'min': q_meta.MIN,
    }


def quantize_coeffs(b, a, wi=0, wf=15, ovfl='sat', quant='round', **kwargs):
    """Quantize b and a arrays in-place to WI.WF RWV floats."""
    q = Fixed({'WI': int(wi), 'WF': int(wf), 'ovfl': ovfl, 'quant': quant})
    b_q = q.fixp(np.array(b, dtype=float)).tolist()
    a_arr = np.array(a, dtype=float)
    if len(a_arr) > 1:
        a_q = np.concatenate(([1.0], q.fixp(a_arr[1:]))).tolist()
    else:
        a_q = [1.0]
    return {'b': b_q, 'a': a_q, 'n_over': q.N_over}


class FIR_DF_pyfixp:
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
        for q in (self.Q_b, self.Q_i, self.Q_mul, self.Q_acc, self.Q_o):
            q.resetN()

    def fxfilter(self, x: np.ndarray) -> np.ndarray:
        x = np.asarray(x, dtype=np.float64)
        x_q = self.Q_i.fixp(x)
        N = len(x_q)
        y_q = np.zeros(N)
        data = np.concatenate((self.zi, x_q))

        for k in range(N):
            window = data[k : k + self.L][::-1]
            products_q = self.Q_mul.fixp(window * self.b_q)
            acc = self.Q_acc.fixp(np.sum(products_q))
            y_q[k] = acc

        if self.L > 1:
            self.zi = data[-(self.L - 1):]
        return self.Q_o.fixp(y_q)


class IIR_DF1_pyfixp:
    def __init__(self, b, a, QCB, QCA, QI, QACC, QO):
        self.Q_b = Fixed(QCB)
        self.Q_a = Fixed(QCA)
        self.Q_i = Fixed(QI)
        self.Q_mul_b = Fixed(QACC.copy())
        self.Q_mul_a = Fixed(QACC.copy())
        self.Q_acc = Fixed(QACC)
        self.Q_o = Fixed(QO)

        self.b_q = self.Q_b.fixp(b)
        self.a_q = np.concatenate(([1.0], self.Q_a.fixp(a[1:]))) if len(a) > 1 else np.array([1.0])
        self.L = max(len(self.b_q), len(self.a_q))
        if len(self.b_q) < self.L:
            self.b_q = np.concatenate((self.b_q, np.zeros(self.L - len(self.b_q))))
        if len(self.a_q) < self.L:
            self.a_q = np.concatenate((self.a_q, np.zeros(self.L - len(self.a_q))))
        self.reset()

    def reset(self):
        self.zi_b = np.zeros(self.L - 1) if self.L > 1 else np.array([])
        self.zi_a = np.zeros(self.L - 1) if self.L > 1 else np.array([])
        for q in (self.Q_b, self.Q_a, self.Q_i, self.Q_mul_b, self.Q_mul_a, self.Q_acc, self.Q_o):
            q.resetN()

    def fxfilter(self, x: np.ndarray) -> np.ndarray:
        x = np.asarray(x, dtype=np.float64)
        x_q = self.Q_i.fixp(x)
        N = len(x_q)
        y_q = np.zeros(N)
        self.zi_b = np.concatenate((self.zi_b, x_q))

        for k in range(N):
            window_b = self.zi_b[k : k + len(self.b_q)][::-1]
            sum_b = self.Q_acc.fixp(np.sum(self.Q_mul_b.fixp(window_b * self.b_q)))
            sum_a = self.Q_acc.fixp(np.sum(self.Q_mul_a.fixp(self.zi_a * self.a_q[1:])))
            acc = self.Q_acc.fixp(sum_b - sum_a)
            out = self.Q_o.fixp(acc)
            y_q[k] = out
            if self.L > 1:
                self.zi_a[1:] = self.zi_a[:-1]
                self.zi_a[0] = out

        if self.L > 1:
            self.zi_b = self.zi_b[-(self.L - 1):]
        return y_q


class IIR_SOS_pyfixp:
    def __init__(self, sos, QCB, QCA, QI, QACC, QO):
        self.sections = []
        Ns = len(sos)
        g = [np.max(np.abs(sos[i, 0:3])) for i in range(Ns)]
        K = np.prod(g)
        K_dist = K ** (1.0 / Ns) if K > 1e-30 else 0.0

        for i in range(Ns):
            b_sec = (sos[i, 0:3] / g[i]) * K_dist if g[i] > 1e-30 else np.zeros(3)
            a_sec = sos[i, 3:6]
            self.sections.append(IIR_DF1_pyfixp(b_sec, a_sec, QCB, QCA, QI, QACC, QO))

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


def _resolve_accu_bits(b_norm, a_norm, is_fir, qi_wi, qi_wf, qc_wi, qc_wf,
                       accu_mode='auto', acc_qi=4, acc_qf=28):
    """Calculate accumulator WI, WF for 'auto' (coeff area), 'full' (tap count), or 'man'."""
    mode = str(accu_mode or 'auto').lower()
    if mode == 'man':
        return int(acc_qi), int(acc_qf)
    wf = int(qi_wf) + int(qc_wf)
    if mode == 'full':
        L = max(1, len(b_norm))
        wi = int(qi_wi) + int(qc_wi) + int(np.ceil(np.log2(L)))
        return wi, wf
    # 'auto': bit growth from sum of |coeffs| (pyfda fir_df.py update_accu_settings)
    area = float(np.sum(np.abs(b_norm))) + (0.0 if is_fir else float(np.sum(np.abs(a_norm[1:]))))
    extra = max(0, int(np.ceil(np.log2(max(area, 1.0)))))
    wi = int(qi_wi) + extra
    return wi, wf


def fixpoint_filter(b, a, x=None, sos=None,
                    coeff_qi=2, coeff_qf=13,
                    in_qi=2, in_qf=13, in_ovfl='sat', in_quant='round',
                    acc_qi=4, acc_qf=26, acc_ovfl='wrap', acc_quant='floor', accu_mode='auto',
                    out_qi=2, out_qf=13, out_ovfl='sat', out_quant='round',
                    # Backwards-compatible legacy args
                    signal_qi=None, signal_qf=None, overflow=None, quant_mode=None,
                    topology='auto', n_samples=256,
                    fs=48000, n_start=0, fft_win='rectangular', **kwargs):
    """Simulate fixpoint filter responses with per-stage quantizers and nonlinear FFT."""
    b = np.array(b, dtype=np.float64)
    a = np.array(a, dtype=np.float64)

    if signal_qi is not None:
        in_qi = out_qi = signal_qi
    if signal_qf is not None:
        in_qf = out_qf = signal_qf
    if overflow is not None:
        in_ovfl = acc_ovfl = out_ovfl = overflow
    if quant_mode is not None:
        in_quant = acc_quant = out_quant = quant_mode

    ovfl_map = {'saturate': 'sat', 'wrap': 'wrap', 'sat': 'sat'}
    quant_map = {
        'round': 'round', 'truncate': 'fix', 'fix': 'fix',
        'floor': 'floor', 'ceil': 'ceil', 'rint': 'rint',
    }

    def _qd(wi, wf, q, o):
        return {
            'WI': int(wi), 'WF': int(wf),
            'quant': quant_map.get(str(q).lower(), 'round'),
            'ovfl': ovfl_map.get(str(o).lower(), 'sat'),
            'N_over': 0,
        }

    a0 = a[0] if abs(a[0]) > 1e-15 else 1.0
    b_norm = b / a0
    a_norm = a / a0
    is_fir = (len(a_norm) == 1) or np.allclose(a_norm[1:], 0)

    resolved_acc_qi, resolved_acc_wf = _resolve_accu_bits(
        b_norm, a_norm, is_fir, in_qi, in_qf, coeff_qi, coeff_qf,
        accu_mode=accu_mode, acc_qi=acc_qi, acc_qf=acc_qf
    )

    QCB = _qd(coeff_qi, coeff_qf, out_quant, out_ovfl)
    QCA = _qd(coeff_qi, coeff_qf, out_quant, out_ovfl)
    QI = _qd(in_qi, in_qf, in_quant, in_ovfl)
    QACC = _qd(resolved_acc_qi, resolved_acc_wf, acc_quant, acc_ovfl)
    QO = _qd(out_qi, out_qf, out_quant, out_ovfl)

    use_sos = (topology == 'iir_sos') or (topology == 'auto' and not is_fir and sos is not None and len(sos) > 0)
    if is_fir or topology == 'fir_df':
        filt = FIR_DF_pyfixp(b_norm, QCB, QI, QACC, QO)
        b_q, a_q = filt.b_q, np.array([1.0])
        used_topology = 'FIR_DF'
    elif use_sos and sos is not None and len(sos) > 0:
        sos_arr = np.asarray(sos, dtype=np.float64)
        filt = IIR_SOS_pyfixp(sos_arr, QCB, QCA, QI, QACC, QO)
        b_q, a_q = filt.b_q, filt.a_q
        used_topology = 'IIR_SOS'
    else:
        filt = IIR_DF1_pyfixp(b_norm, a_norm, QCB, QCA, QI, QACC, QO)
        b_q, a_q = filt.b_q, filt.a_q
        used_topology = 'IIR_DF1'

    # Impulse & step
    x_imp = np.zeros(int(n_samples))
    x_imp[0] = 1.0
    filt.reset()
    y_fix_imp = filt.fxfilter(x_imp)

    x_step = np.ones(int(n_samples))
    filt.reset()
    y_fix_step = filt.fxfilter(x_step)

    # Custom stimulus + nonlinear FFT (captures quantization & saturation distortion!)
    y_fix_stim = None
    x_q_stim = None
    y_fix_fft_db = None
    x_q_fft_db = None
    p_xq_dbw = None
    p_yq_dbw = None
    if x is not None:
        x_stim = np.array(x, dtype=np.float64)
        x_q_stim = Fixed(QI).fixp(x_stim).tolist()
        filt.reset()
        y_fix_arr = filt.fxfilter(x_stim)
        y_fix_stim = y_fix_arr.tolist()

        # Nonlinear FFT on [n_start : len]
        _win_fn = globals().get('_get_fft_window')
        if _win_fn is None:
            from filter_analysis import _get_fft_window as _win_fn
        ns = max(0, min(int(n_start or 0), max(0, len(x_stim) - 16)))
        y_seg = y_fix_arr[ns:]
        xq_seg = np.asarray(x_q_stim[ns:], dtype=float)
        n_data = len(y_seg)
        if n_data >= 16:
            win, nenbw, cgain = _win_fn(fft_win, n_data)
            win_norm = win / max(cgain, 1e-12)
            xq_fft = np.fft.fft(xq_seg * win_norm) / n_data
            yq_fft = np.fft.fft(y_seg * win_norm) / n_data
            p_xq = float(np.sum(np.square(np.abs(xq_fft))) / nenbw)
            p_yq = float(np.sum(np.square(np.abs(yq_fft))) / nenbw)
            p_xq_dbw = float(10.0 * np.log10(max(p_xq, 1e-24)))
            p_yq_dbw = float(10.0 * np.log10(max(p_yq, 1e-24)))
            half = n_data // 2
            xq_ssb = np.insert(np.abs(xq_fft[1:half]) * 2.0, 0, np.abs(xq_fft[0]))
            yq_ssb = np.insert(np.abs(yq_fft[1:half]) * 2.0, 0, np.abs(yq_fft[0]))
            x_q_fft_db = (20.0 * np.log10(np.maximum(xq_ssb, 1e-12))).tolist()
            y_fix_fft_db = (20.0 * np.log10(np.maximum(yq_ssb, 1e-12))).tolist()

    if isinstance(filt, FIR_DF_pyfixp):
        overflow_counts = {
            'coeff': filt.Q_b.N_over,
            'input': filt.Q_i.N_over,
            'acc': filt.Q_acc.N_over + filt.Q_mul.N_over,
            'output': filt.Q_o.N_over,
        }
    elif isinstance(filt, IIR_SOS_pyfixp):
        overflow_counts = {
            'coeff': sum(s.Q_b.N_over + s.Q_a.N_over for s in filt.sections),
            'input': sum(s.Q_i.N_over for s in filt.sections),
            'acc': sum(s.Q_acc.N_over + s.Q_mul_b.N_over + s.Q_mul_a.N_over for s in filt.sections),
            'output': sum(s.Q_o.N_over for s in filt.sections),
        }
    else:
        overflow_counts = {
            'coeff': filt.Q_b.N_over + filt.Q_a.N_over,
            'input': filt.Q_i.N_over,
            'acc': filt.Q_acc.N_over + filt.Q_mul_b.N_over + filt.Q_mul_a.N_over,
            'output': filt.Q_o.N_over,
        }

    w, h_float = signal.freqz(b_norm, a_norm, worN=1024)
    _, h_fix = signal.freqz(b_q, a_q, worN=1024)
    freq_norm = w / np.pi

    mag_float_db = (20 * np.log10(np.maximum(np.abs(h_float), 1e-15))).tolist()
    mag_fix_db = (20 * np.log10(np.maximum(np.abs(h_fix), 1e-15))).tolist()

    phase_float_rad = np.unwrap(np.angle(h_float))
    phase_fix_rad = np.unwrap(np.angle(h_fix))
    phase_float_deg = np.degrees(phase_float_rad).tolist()
    phase_fix_deg = np.degrees(phase_fix_rad).tolist()

    _, gd_float = signal.group_delay((b_norm, a_norm), w=1024)
    _, gd_fix = signal.group_delay((b_q, a_q), w=1024)

    pd_float = np.zeros_like(phase_float_rad)
    pd_fix = np.zeros_like(phase_fix_rad)
    mask = w > 1e-10
    pd_float[mask] = -phase_float_rad[mask] / w[mask]
    pd_fix[mask] = -phase_fix_rad[mask] / w[mask]

    z_float, p_float, _ = signal.tf2zpk(b_norm, a_norm)
    z_fix, p_fix, _ = signal.tf2zpk(b_q, a_q)

    y_float_imp = signal.lfilter(b_norm, a_norm, x_imp)
    error = y_float_imp - y_fix_imp
    sig_power = np.sum(y_float_imp ** 2)
    err_power = np.sum(error ** 2)
    snr = 10 * np.log10(sig_power / max(err_power, 1e-30))

    total_bits = 1 + int(QCB['WI']) + int(QCB['WF'])

    return {
        'n': list(range(int(n_samples))),
        'y_float_imp': y_float_imp.tolist(),
        'y_fix_imp': y_fix_imp.tolist(),
        'y_fix_step': y_fix_step.tolist(),
        'x_q_stim': x_q_stim,
        'y_fix_stim': y_fix_stim,
        'x_q_fft_db': x_q_fft_db,
        'y_fix_fft_db': y_fix_fft_db,
        'p_xq_dbw': p_xq_dbw,
        'p_yq_dbw': p_yq_dbw,
        'error_imp': error.tolist(),
        'snr_db': float(snr),
        'b_quantized': b_q.tolist(),
        'a_quantized': a_q.tolist(),
        'freq_norm': freq_norm.tolist(),
        'mag_float_db': mag_float_db,
        'mag_fix_db': mag_fix_db,
        'phase_float_deg': phase_float_deg,
        'phase_fix_deg': phase_fix_deg,
        'gd_float': gd_float.tolist(),
        'gd_fix': gd_fix.tolist(),
        'pd_float': pd_float.tolist(),
        'pd_fix': pd_fix.tolist(),
        'zeros_float_real': np.real(z_float).tolist(),
        'zeros_float_imag': np.imag(z_float).tolist(),
        'poles_float_real': np.real(p_float).tolist(),
        'poles_float_imag': np.imag(p_float).tolist(),
        'zeros_fix_real': np.real(z_fix).tolist(),
        'zeros_fix_imag': np.imag(z_fix).tolist(),
        'poles_fix_real': np.real(p_fix).tolist(),
        'poles_fix_imag': np.imag(p_fix).tolist(),
        'total_bits': total_bits,
        'topology': used_topology,
        'acc_wi': int(QACC['WI']),
        'acc_wf': int(QACC['WF']),
        'overflow_counts': overflow_counts,
    }


def generate_verilog(b, a, coeff_qi=2, coeff_qf=13, in_qi=2, in_qf=13,
                     acc_qi=4, acc_qf=26, out_qi=2, out_qf=13,
                     ovfl='sat', quant='round', accu_mode='auto', **kwargs):
    """Generate synthesizable Verilog-2001 module for the quantized FIR_DF or IIR_DF1 filter."""
    b = np.asarray(b, dtype=float)
    a = np.asarray(a, dtype=float)
    a0 = a[0] if abs(a[0]) > 1e-15 else 1.0
    b_norm = b / a0
    a_norm = a / a0
    is_fir = (len(a_norm) == 1) or np.allclose(a_norm[1:], 0)

    acc_qi_res, acc_wf_res = _resolve_accu_bits(
        b_norm, a_norm, is_fir, in_qi, in_qf, coeff_qi, coeff_qf,
        accu_mode=accu_mode, acc_qi=acc_qi, acc_qf=acc_qf
    )

    wi_x, wf_x = int(in_qi), int(in_qf)
    wi_c, wf_c = int(coeff_qi), int(coeff_qf)
    wi_a, wf_a = int(acc_qi_res), int(acc_wf_res)
    wi_y, wf_y = int(out_qi), int(out_qf)

    w_x = 1 + wi_x + wf_x
    w_c = 1 + wi_c + wf_c
    w_a = 1 + wi_a + wf_a
    w_y = 1 + wi_y + wf_y

    qc = Fixed({'WI': wi_c, 'WF': wf_c, 'ovfl': ovfl, 'quant': quant})
    b_int = [int(round(qc.fixp(v) * (2.0 ** wf_c))) for v in b_norm]
    a_int = [int(round(qc.fixp(v) * (2.0 ** wf_c))) for v in a_norm[1:]]

    shift = max(0, wf_a - wf_y)
    lines = [
        "// Generated by PyFDA Web — Synthesizable Fixed-Point Filter",
        f"// Topology: {'FIR Direct-Form' if is_fir else 'IIR Direct-Form I'}",
        f"// Q_X = Q{wi_x}.{wf_x} ({w_x}-bit), Q_C = Q{wi_c}.{wf_c} ({w_c}-bit), "
        f"Q_A = Q{wi_a}.{wf_a} ({w_a}-bit), Q_Y = Q{wi_y}.{wf_y} ({w_y}-bit)",
        "`timescale 1ns/1ps",
        "",
        f"module {'fir_df_filter' if is_fir else 'iir_df1_filter'} (",
        "    input  wire                     clk,",
        "    input  wire                     rst,",
        "    input  wire                     en,",
        f"    input  wire signed [{w_x - 1}:0]      x_in,",
        f"    output reg  signed [{w_y - 1}:0]      y_out",
        ");",
        "",
    ]

    for i, c in enumerate(b_int):
        lines.append(f"    localparam signed [{w_c - 1}:0] B{i} = {w_c}'sd{c};")
    if not is_fir:
        for i, c in enumerate(a_int, start=1):
            lines.append(f"    localparam signed [{w_c - 1}:0] A{i} = {w_c}'sd{c};")
    lines.append("")

    n_b = len(b_int)
    if n_b > 1:
        lines.append(f"    reg signed [{w_x - 1}:0] x_d [0:{n_b - 2}];")
    if not is_fir and len(a_int) > 0:
        lines.append(f"    reg signed [{w_y - 1}:0] y_d [0:{len(a_int) - 1}];")

    lines.append(f"    wire signed [{w_a - 1}:0] acc;")
    terms = [f"($signed(x_in) * B0)"] + [f"($signed(x_d[{i - 1}]) * B{i})" for i in range(1, n_b)]
    if not is_fir:
        for i in range(len(a_int)):
            terms.append(f"- ($signed(y_d[{i}]) * A{i + 1})")
    lines.append("    assign acc = " + " + ".join(terms) + ";")
    lines.append("")

    # Saturation / truncation from accumulator to output
    lines.append(f"    wire signed [{w_a - 1}:0] acc_scaled = acc >>> {shift};")
    max_y = (1 << (w_y - 1)) - 1
    min_y = -(1 << (w_y - 1))
    lines.append("    integer i;")
    lines.append("    always @(posedge clk) begin")
    lines.append("        if (rst) begin")
    lines.append(f"            y_out <= {w_y}'sd0;")
    for i in range(max(0, n_b - 1)):
        lines.append(f"            x_d[{i}] <= {w_x}'sd0;")
    if not is_fir:
        for i in range(len(a_int)):
            lines.append(f"            y_d[{i}] <= {w_y}'sd0;")
    lines.append("        end else if (en) begin")
    if ovfl == 'sat':
        lines.append(f"            if (acc_scaled > {w_a}'sd{max_y}) y_out <= {w_y}'sd{max_y};")
        lines.append(f"            else if (acc_scaled < -{w_a}'sd{abs(min_y)}) y_out <= -{w_y}'sd{abs(min_y)};")
        lines.append(f"            else y_out <= acc_scaled[{w_y - 1}:0];")
    else:
        lines.append(f"            y_out <= acc_scaled[{w_y - 1}:0];")
    if n_b > 1:
        lines.append("            x_d[0] <= x_in;")
        for i in range(1, n_b - 1):
            lines.append(f"            x_d[{i}] <= x_d[{i - 1}];")
    if not is_fir and len(a_int) > 0:
        lines.append("            y_d[0] <= y_out;")
        for i in range(1, len(a_int)):
            lines.append(f"            y_d[{i}] <= y_d[{i - 1}];")
    lines.append("        end")
    lines.append("    end")
    lines.append("")
    lines.append("endmodule")
    return {'verilog': "\n".join(lines), 'topology': 'FIR_DF' if is_fir else 'IIR_DF1'}
