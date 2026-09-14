#include <jxl/decode.h>
#include <jxl/encode.h>

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <vector>

namespace {
std::vector<uint8_t> result;
int last_error = 0;
uint32_t result_width = 0;
uint32_t result_height = 0;

int Fail(int code) {
  result.clear();
  last_error = code;
  return code;
}
}  // namespace

extern "C" {

int jexfold_encode_jpeg(const uint8_t* input, size_t size, int effort) {
  result.clear();
  last_error = 0;
  JxlEncoder* encoder = JxlEncoderCreate(nullptr);
  if (!encoder) return Fail(101);
  JxlEncoderFrameSettings* settings = JxlEncoderFrameSettingsCreate(encoder, nullptr);
  if (!settings) {
    JxlEncoderDestroy(encoder);
    return Fail(102);
  }
  if (JxlEncoderUseContainer(encoder, JXL_TRUE) != JXL_ENC_SUCCESS ||
      JxlEncoderFrameSettingsSetOption(settings, JXL_ENC_FRAME_SETTING_EFFORT,
                                       std::clamp(effort, 3, 9)) != JXL_ENC_SUCCESS ||
      JxlEncoderStoreJPEGMetadata(encoder, JXL_TRUE) != JXL_ENC_SUCCESS ||
      JxlEncoderAddJPEGFrame(settings, input, size) != JXL_ENC_SUCCESS) {
    JxlEncoderDestroy(encoder);
    return Fail(103);
  }
  JxlEncoderCloseInput(encoder);
  result.resize(std::max<size_t>(65536, size));
  uint8_t* next = result.data();
  size_t available = result.size();
  for (;;) {
    const JxlEncoderStatus status = JxlEncoderProcessOutput(encoder, &next, &available);
    if (status == JXL_ENC_SUCCESS) break;
    if (status != JXL_ENC_NEED_MORE_OUTPUT) {
      JxlEncoderDestroy(encoder);
      return Fail(104);
    }
    const size_t written = static_cast<size_t>(next - result.data());
    result.resize(result.size() * 2);
    next = result.data() + written;
    available = result.size() - written;
  }
  result.resize(static_cast<size_t>(next - result.data()));
  JxlEncoderDestroy(encoder);
  return 0;
}

int jexfold_reconstruct_jpeg(const uint8_t* input, size_t size) {
  result.clear();
  last_error = 0;
  JxlDecoder* decoder = JxlDecoderCreate(nullptr);
  if (!decoder) return Fail(201);
  if (JxlDecoderSubscribeEvents(decoder, JXL_DEC_JPEG_RECONSTRUCTION | JXL_DEC_FULL_IMAGE) !=
      JXL_DEC_SUCCESS) {
    JxlDecoderDestroy(decoder);
    return Fail(202);
  }
  JxlDecoderSetInput(decoder, input, size);
  JxlDecoderCloseInput(decoder);
  bool buffer_set = false;
  for (;;) {
    const JxlDecoderStatus status = JxlDecoderProcessInput(decoder);
    if (status == JXL_DEC_JPEG_RECONSTRUCTION) {
      result.resize(std::max<size_t>(65536, size * 2));
      if (JxlDecoderSetJPEGBuffer(decoder, result.data(), result.size()) != JXL_DEC_SUCCESS) {
        JxlDecoderDestroy(decoder);
        return Fail(203);
      }
      buffer_set = true;
    } else if (status == JXL_DEC_JPEG_NEED_MORE_OUTPUT) {
      const size_t remaining = JxlDecoderReleaseJPEGBuffer(decoder);
      const size_t written = result.size() - remaining;
      result.resize(result.size() * 2);
      if (JxlDecoderSetJPEGBuffer(decoder, result.data() + written, result.size() - written) !=
          JXL_DEC_SUCCESS) {
        JxlDecoderDestroy(decoder);
        return Fail(204);
      }
    } else if (status == JXL_DEC_FULL_IMAGE) {
      if (!buffer_set) {
        JxlDecoderDestroy(decoder);
        return Fail(205);
      }
      const size_t remaining = JxlDecoderReleaseJPEGBuffer(decoder);
      result.resize(result.size() - remaining);
      JxlDecoderDestroy(decoder);
      return 0;
    } else if (status == JXL_DEC_NEED_IMAGE_OUT_BUFFER) {
      // The codestream has no reconstructible JPEG. Pixel decoding is a
      // separate operation; do not spin forever on this status.
      JxlDecoderDestroy(decoder);
      return Fail(205);
    } else if (status == JXL_DEC_SUCCESS || status == JXL_DEC_ERROR ||
               status == JXL_DEC_NEED_MORE_INPUT) {
      JxlDecoderDestroy(decoder);
      return Fail(206);
    }
  }
}

int jexfold_decode_rgba(const uint8_t* input, size_t size) {
  result.clear();
  result_width = 0;
  result_height = 0;
  last_error = 0;
  JxlDecoder* decoder = JxlDecoderCreate(nullptr);
  if (!decoder) return Fail(301);
  if (JxlDecoderSubscribeEvents(decoder, JXL_DEC_BASIC_INFO | JXL_DEC_COLOR_ENCODING |
                                             JXL_DEC_FULL_IMAGE) != JXL_DEC_SUCCESS) {
    JxlDecoderDestroy(decoder);
    return Fail(302);
  }
  JxlDecoderSetInput(decoder, input, size);
  JxlDecoderCloseInput(decoder);
  const JxlPixelFormat format = {4, JXL_TYPE_UINT8, JXL_NATIVE_ENDIAN, 0};
  for (;;) {
    const JxlDecoderStatus status = JxlDecoderProcessInput(decoder);
    if (status == JXL_DEC_BASIC_INFO) {
      JxlBasicInfo info;
      if (JxlDecoderGetBasicInfo(decoder, &info) != JXL_DEC_SUCCESS || info.xsize == 0 ||
          info.ysize == 0 || info.xsize > std::numeric_limits<size_t>::max() / 4 ||
          info.ysize > std::numeric_limits<size_t>::max() / (static_cast<size_t>(info.xsize) * 4)) {
        JxlDecoderDestroy(decoder);
        return Fail(303);
      }
      result_width = info.xsize;
      result_height = info.ysize;
    } else if (status == JXL_DEC_COLOR_ENCODING) {
      JxlColorEncoding color;
      JxlColorEncodingSetToSRGB(&color, JXL_FALSE);
      if (JxlDecoderSetPreferredColorProfile(decoder, &color) != JXL_DEC_SUCCESS) {
        JxlDecoderDestroy(decoder);
        return Fail(304);
      }
    } else if (status == JXL_DEC_NEED_IMAGE_OUT_BUFFER) {
      size_t output_size = 0;
      if (JxlDecoderImageOutBufferSize(decoder, &format, &output_size) != JXL_DEC_SUCCESS ||
          output_size == 0) {
        JxlDecoderDestroy(decoder);
        return Fail(305);
      }
      result.resize(output_size);
      if (JxlDecoderSetImageOutBuffer(decoder, &format, result.data(), result.size()) !=
          JXL_DEC_SUCCESS) {
        JxlDecoderDestroy(decoder);
        return Fail(306);
      }
    } else if (status == JXL_DEC_FULL_IMAGE) {
      JxlDecoderDestroy(decoder);
      return result.empty() ? Fail(307) : 0;
    } else if (status == JXL_DEC_SUCCESS || status == JXL_DEC_ERROR ||
               status == JXL_DEC_NEED_MORE_INPUT || status == JXL_DEC_NEED_PREVIEW_OUT_BUFFER ||
               status == JXL_DEC_JPEG_NEED_MORE_OUTPUT) {
      JxlDecoderDestroy(decoder);
      return Fail(308);
    }
  }
}

const uint8_t* jexfold_result_data() {
  return result.data();
}
size_t jexfold_result_size() {
  return result.size();
}
int jexfold_result_error() {
  return last_error;
}
uint32_t jexfold_result_width() {
  return result_width;
}
uint32_t jexfold_result_height() {
  return result_height;
}

}  // extern "C"
