MEMORY
{
  /* nRF52840 with Adafruit UF2 bootloader (as shipped on Seeed XIAO nRF52840). */
  FLASH : ORIGIN = 0x00001000, LENGTH = 1020K
  RAM : ORIGIN = 0x20000008, LENGTH = 255K

  /* Raw nRF52840 (no bootloader):                                 */
  /* FLASH : ORIGIN = 0x00000000, LENGTH = 1024K                   */
  /* RAM   : ORIGIN = 0x20000000, LENGTH = 256K                    */
}
