use crate::utility::*;
use std::mem::MaybeUninit;

#[inline]
pub(crate) fn sub_slice(lhs: &mut [f32], rhs: &[f32]) {
    lhs.iter_mut().zip(rhs).for_each(|(l, r)| *l -= *r);
}

#[inline]
pub(crate) fn mul_slice(lhs: &mut [f32], rhs: &[f32]) {
    lhs.iter_mut().zip(rhs).for_each(|(l, r)| *l *= *r);
}

#[inline]
pub(crate) fn div_slice(lhs: &mut [f32], rhs: &[f32], default: f32) {
    lhs.iter_mut()
        .zip(rhs)
        .for_each(|(l, r)| *l = if is_zero(*r) { default } else { *l / *r });
}

#[inline]
pub(crate) fn div_slice_uninit(
    dst: &mut [MaybeUninit<f32>],
    lhs: &[f32],
    rhs: &[f32],
    default: f32,
) {
    dst.iter_mut()
        .zip(lhs.iter().zip(rhs))
        .for_each(|(d, (l, r))| {
            d.write(if is_zero(*r) { default } else { *l / *r });
        });
}

#[inline]
pub(crate) fn mul_slice_scalar_uninit(dst: &mut [MaybeUninit<f32>], src: &[f32], scalar: f32) {
    dst.iter_mut().zip(src).for_each(|(d, s)| {
        d.write(*s * scalar);
    });
}

#[inline]
pub(crate) fn sum_slices_uninit<'a>(dst: &'a mut [MaybeUninit<f32>], src: &[f32]) -> &'a mut [f32] {
    let len = dst.len();
    dst.iter_mut().zip(src).for_each(|(d, s)| {
        d.write(*s);
    });
    let dst = unsafe { &mut *(dst as *mut _ as *mut [f32]) };
    src[len..].chunks_exact(len).for_each(|s| {
        dst.iter_mut().zip(s).for_each(|(d, s)| {
            *d += *s;
        });
    });
    dst
}

#[inline]
pub(crate) fn sum_slices_f64_uninit<'a>(
    dst: &'a mut [MaybeUninit<f64>],
    src: &[f32],
) -> &'a mut [f64] {
    let len = dst.len();
    dst.iter_mut().zip(src).for_each(|(d, s)| {
        d.write(*s as f64);
    });
    let dst = unsafe { &mut *(dst as *mut _ as *mut [f64]) };
    src[len..].chunks_exact(len).for_each(|s| {
        dst.iter_mut().zip(s).for_each(|(d, s)| {
            *d += *s as f64;
        });
    });
    dst
}

#[inline]
pub(crate) fn fma_slices_uninit<'a>(
    dst: &'a mut [MaybeUninit<f32>],
    src1: &[f32],
    src2: &[f32],
) -> &'a mut [f32] {
    let len = dst.len();
    dst.iter_mut()
        .zip(src1.iter().zip(src2))
        .for_each(|(d, (s1, s2))| {
            d.write(*s1 * *s2);
        });
    let dst = unsafe { &mut *(dst as *mut _ as *mut [f32]) };
    src1[len..]
        .chunks_exact(len)
        .zip(src2[len..].chunks_exact(len))
        .for_each(|(s1, s2)| {
            dst.iter_mut()
                .zip(s1.iter().zip(s2))
                .for_each(|(d, (s1, s2))| {
                    *d += *s1 * *s2;
                });
        });
    dst
}

#[inline]
pub(crate) fn max_slices_uninit<'a>(dst: &'a mut [MaybeUninit<f32>], src: &[f32]) -> &'a mut [f32] {
    let len = dst.len();
    dst.iter_mut().zip(src).for_each(|(d, s)| {
        d.write(*s);
    });
    let dst = unsafe { &mut *(dst as *mut _ as *mut [f32]) };
    src[len..].chunks_exact(len).for_each(|s| {
        dst.iter_mut().zip(s).for_each(|(d, s)| {
            *d = max(*d, *s);
        });
    });
    dst
}

#[inline]
pub(crate) fn max_fma_slices_uninit<'a>(
    dst: &'a mut [MaybeUninit<f32>],
    src1: &[f32],
    src2: &[f32],
) -> &'a mut [f32] {
    let len = dst.len();
    dst.iter_mut()
        .zip(src1.iter().zip(src2))
        .for_each(|(d, (s1, s2))| {
            d.write(if s2.is_sign_positive() {
                *s1 * *s2
            } else {
                *s1
            });
        });
    let dst = unsafe { &mut *(dst as *mut _ as *mut [f32]) };
    src1[len..]
        .chunks_exact(len)
        .zip(src2[len..].chunks_exact(len))
        .for_each(|(s1, s2)| {
            dst.iter_mut()
                .zip(s1.iter().zip(s2))
                .for_each(|(d, (s1, s2))| {
                    if s2.is_sign_positive() {
                        *d += *s1 * *s2;
                    } else {
                        *d = max(*d, *s1);
                    }
                });
        });
    dst
}

#[inline]
pub(crate) fn row<T>(slice: &[T], index: usize, row_size: usize) -> &[T] {
    &slice[index * row_size..(index + 1) * row_size]
}

#[inline]
pub(crate) fn row_mut<T>(slice: &mut [T], index: usize, row_size: usize) -> &mut [T] {
    &mut slice[index * row_size..(index + 1) * row_size]
}

/// qpoker: spreads a per-bucket `num_actions × num_buckets` strategy over the hands, as
/// `num_actions × map.len()`. A hand in no bucket gets the uniform strategy.
#[inline]
pub(crate) fn expand_buckets(
    src: &[f32],
    map: &[u16],
    num_buckets: usize,
    num_actions: usize,
) -> Vec<f32> {
    let num_hands = map.len();
    let uniform = 1.0 / num_actions as f32;
    let mut dst = Vec::with_capacity(num_actions * num_hands);
    for action in 0..num_actions {
        let bucket_row = row(src, action, num_buckets);
        dst.extend(map.iter().map(|&b| match b {
            u16::MAX => uniform,
            b => bucket_row[b as usize],
        }));
    }
    dst
}

/// qpoker: sums a per-hand `num_actions × map.len()` array into its buckets, each hand
/// weighted by `weights`, as `num_actions × num_buckets`.
#[inline]
pub(crate) fn reduce_buckets(
    src: &[f32],
    map: &[u16],
    num_buckets: usize,
    weights: &[f32],
) -> Vec<f32> {
    let num_hands = map.len();
    let num_actions = src.len() / num_hands;
    let mut sums = vec![0.0f64; num_actions * num_buckets];
    for action in 0..num_actions {
        let hand_row = row(src, action, num_hands);
        let sum_row = row_mut(&mut sums, action, num_buckets);
        for ((&b, &v), &w) in map.iter().zip(hand_row).zip(weights) {
            if b != u16::MAX {
                sum_row[b as usize] += v as f64 * w as f64;
            }
        }
    }
    sums.into_iter().map(|v| v as f32).collect()
}
