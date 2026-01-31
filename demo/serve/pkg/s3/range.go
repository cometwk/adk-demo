package s3

import (
	"fmt"
	"strconv"
	"strings"
)

// parseRange parses a single RFC 7233 byte range.
// Supported:
// - bytes=start-end
// - bytes=start-
// - bytes=-suffix
//
// It rejects multi-range requests.
func parseRange(header string, size int64) (start, end int64, err error) {
	header = strings.TrimSpace(header)
	if !strings.HasPrefix(header, "bytes=") {
		return 0, 0, fmt.Errorf("invalid range unit")
	}
	spec := strings.TrimSpace(strings.TrimPrefix(header, "bytes="))
	if spec == "" || strings.Contains(spec, ",") {
		return 0, 0, fmt.Errorf("multi-range not supported")
	}

	// suffix: "-N"
	if strings.HasPrefix(spec, "-") {
		suffixStr := strings.TrimSpace(strings.TrimPrefix(spec, "-"))
		suffix, err := strconv.ParseInt(suffixStr, 10, 64)
		if err != nil || suffix <= 0 || size <= 0 {
			return 0, 0, fmt.Errorf("invalid suffix range")
		}
		if suffix > size {
			suffix = size
		}
		start = size - suffix
		end = size - 1
		return start, end, nil
	}

	parts := strings.Split(spec, "-")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("invalid range format")
	}
	startStr := strings.TrimSpace(parts[0])
	endStr := strings.TrimSpace(parts[1])

	s, err := strconv.ParseInt(startStr, 10, 64)
	if err != nil || s < 0 || s >= size {
		return 0, 0, fmt.Errorf("invalid range start")
	}
	start = s

	// open-ended: "start-"
	if endStr == "" {
		end = size - 1
		return start, end, nil
	}

	e, err := strconv.ParseInt(endStr, 10, 64)
	if err != nil || e < start {
		return 0, 0, fmt.Errorf("invalid range end")
	}
	if e >= size {
		e = size - 1
	}
	end = e
	return start, end, nil
}

