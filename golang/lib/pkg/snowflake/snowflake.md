<!-- go get github.com/bwmarrin/snowflake -->

By default, the ID format follows the original Twitter snowflake format.

- The ID as a whole is a 63 bit integer stored in an int64
- 41 bits are used to store a timestamp with millisecond precision, using a custom epoch.
- 10 bits are used to store a node id - a range from 0 through 1023.
- 12 bits are used to store a sequence number - a range from 0 through 4095.

